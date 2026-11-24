import { randomUUID } from 'node:crypto';
import { BlobPreconditionFailedError, del, get, head, put } from '@vercel/blob';

type Status = 'correcto' | 'error' | 'pendiente';
export interface StorageDiagnosticResult {
	creacion: Status;
	lectura: Status;
	etagCoincide: boolean | null;
	escrituraCondicional: Status;
	lecturaFinal: Status;
	limpieza: Status;
	tipoError: 'conflicto' | 'otro' | null;
}

/** Uses a unique, private test object and never reads or mutates application data. */
export async function runStorageDiagnostic(): Promise<StorageDiagnosticResult> {
	const path = `diagnostico/${randomUUID()}.json`;
	const result: StorageDiagnosticResult = {
		creacion: 'pendiente', lectura: 'pendiente', etagCoincide: null,
		escrituraCondicional: 'pendiente', lecturaFinal: 'pendiente', limpieza: 'pendiente', tipoError: null,
	};
	let stage: 'creacion' | 'lectura' | 'escrituraCondicional' | 'lecturaFinal' = 'creacion';
	// A failed upload can have reached the service despite the lost response.
	// The random path belongs exclusively to this test, so cleanup is safe.
	try {
		await put(path, JSON.stringify({ prueba: 1 }), { access: 'private', contentType: 'application/json' });
		result.creacion = 'correcto';
		stage = 'lectura';
		const read = await get(path, { access: 'private', useCache: false });
		if (!read || read.statusCode !== 200 || !read.stream) throw new Error('Lectura no disponible.');
		const content: unknown = JSON.parse(await new Response(read.stream).text());
		if (!content || typeof content !== 'object' || !('prueba' in content) || content.prueba !== 1) throw new Error('Contenido inesperado.');
		const metadata = await head(path);
		result.lectura = 'correcto';
		result.etagCoincide = read.blob.etag.length > 0 && read.blob.etag === metadata.etag;
		stage = 'escrituraCondicional';
		await put(path, JSON.stringify({ prueba: 2 }), {
			access: 'private', allowOverwrite: true, cacheControlMaxAge: 0,
			contentType: 'application/json', ifMatch: read.blob.etag,
		});
		result.escrituraCondicional = 'correcto';
		stage = 'lecturaFinal';
		const finalRead = await get(path, { access: 'private', useCache: false });
		if (!finalRead || finalRead.statusCode !== 200 || !finalRead.stream) throw new Error('Lectura final no disponible.');
		const finalContent: unknown = JSON.parse(await new Response(finalRead.stream).text());
		if (!finalContent || typeof finalContent !== 'object' || !('prueba' in finalContent) || finalContent.prueba !== 2) throw new Error('Contenido final inesperado.');
		result.lecturaFinal = 'correcto';
	} catch (error) {
		result[stage] = 'error';
		result.tipoError = error instanceof BlobPreconditionFailedError ? 'conflicto' : 'otro';
	} finally {
		try {
			await del(path);
			result.limpieza = 'correcto';
		} catch {
			result.limpieza = 'error';
		}
	}
	return result;
}
