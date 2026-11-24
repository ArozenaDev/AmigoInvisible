import { readFile } from 'node:fs/promises';
import { applyMigrations } from '../src/lib/server/postgres-migrations.ts';
import { getDatabasePool } from '../src/lib/server/postgres.ts';

// This script is deliberately manual and does not run during a deployment.
if (!process.env.DATABASE_URL) {
	console.error('Falta configurar la conexión privada a la base de datos.');
	process.exitCode = 1;
} else {
	try {
		const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
		const count = await applyMigrations([{ version: 1, sql }]);
		console.log(`Migraciones aplicadas: ${count}.`);
	} catch {
		// Database exceptions can include connection details; do not print them.
		console.error('No se ha podido aplicar la migración. Comprueba la conexión y el estado de la base de datos.');
		process.exitCode = 1;
	} finally {
		await getDatabasePool().end();
	}
}
