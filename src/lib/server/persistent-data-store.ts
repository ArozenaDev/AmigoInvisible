import { randomInt } from 'node:crypto';
import { BlobPreconditionFailedError, get, put } from '@vercel/blob';

import {
	getLocalData,
	isLocalDataState,
	migrateLocalData,
	emptyLocalData,
	updateLocalData,
	type LocalDataState,
} from './local-json-store.ts';

const DATA_PATHNAME = 'amigo-invisible/state-v1.json';
const MAX_WRITE_ATTEMPTS = 6;

async function waitBeforeRetry(attempt: number): Promise<void> {
	const maximum = Math.min(50 * 2 ** attempt, 800);
	await new Promise((resolve) => setTimeout(resolve, maximum / 2 + randomInt(0, maximum / 2 + 1)));
}

export class PersistentDataConflictError extends Error {
	constructor() {
		super('No se ha podido guardar el cambio. Inténtalo de nuevo.');
	}
}

/**
 * The local JSON implementation remains only for local development and tests.
 * Vercel Functions use a single private Blob document so sessions, editions and
 * reveal auditing are updated by one optimistic-concurrency boundary.
 */
function usesVercelBlob(): boolean {
	return process.env.VERCEL === '1';
}

export async function readPersistentData(): Promise<LocalDataState> {
	if (!usesVercelBlob()) return structuredClone(getLocalData());

	const response = await get(DATA_PATHNAME, { access: 'private', useCache: false });
	if (!response) return emptyLocalData();
	const raw = await new Response(response.stream).text();
	return parseData(raw);
}

export async function updatePersistentData<Result>(
	mutation: (draft: LocalDataState) => Result,
): Promise<Result> {
	if (!usesVercelBlob()) return updateLocalData(mutation);

	for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
		const current = await get(DATA_PATHNAME, { access: 'private', useCache: false });
		if (!current) {
			const draft = emptyLocalData();
			const result = mutation(draft);
			try {
				await put(DATA_PATHNAME, JSON.stringify(draft), {
				access: 'private',
				cacheControlMaxAge: 0,
				contentType: 'application/json; charset=utf-8',
			});
				return result;
			} catch (error) {
				if (error instanceof BlobPreconditionFailedError) {
					if (attempt + 1 < MAX_WRITE_ATTEMPTS) await waitBeforeRetry(attempt);
					continue;
				}
				throw error;
			}
		}

		const draft = parseData(await new Response(current.stream).text());
		const result = mutation(draft);
		try {
			await put(DATA_PATHNAME, JSON.stringify(draft), {
				access: 'private',
				allowOverwrite: true,
				cacheControlMaxAge: 0,
				contentType: 'application/json; charset=utf-8',
				ifMatch: current.blob.etag,
			});
			return result;
		} catch (error) {
			if (error instanceof BlobPreconditionFailedError) {
				if (attempt + 1 < MAX_WRITE_ATTEMPTS) await waitBeforeRetry(attempt);
				continue;
			}
			throw error;
		}
	}

	throw new PersistentDataConflictError();
}

function parseData(raw: string): LocalDataState {
	let parsed: unknown;
	try {
		parsed = migrateLocalData(JSON.parse(raw));
	} catch {
		throw new Error('El almacenamiento privado contiene datos no válidos.');
	}
	if (!isLocalDataState(parsed)) {
		throw new Error('El almacenamiento privado contiene datos no válidos.');
	}
	return parsed;
}
