import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getDatabasePool, withTransaction } from './postgres.ts';

export interface Migration {
	version: number;
	sql: string;
}

/** Apply explicitly supplied migrations exactly once within one transaction. */
export async function applyMigrations(
	migrations: readonly Migration[],
	connect: () => Promise<PoolClient> = () => getDatabasePool().connect(),
): Promise<number> {
	const versions = migrations.map((item) => item.version);
	if (versions.some((version) => !Number.isSafeInteger(version) || version < 1) || new Set(versions).size !== versions.length) {
		throw new Error('Lista de migraciones no válida.');
	}
	return withTransaction(connect, async (client: PoolClient) => {
		// Serialize concurrent migration processes without storing credentials.
		await client.query('SELECT pg_advisory_xact_lock($1)', [74120851]);
		await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
		const current = await client.query<{ version: number; checksum: string }>('SELECT version, checksum FROM schema_migrations');
		const applied = new Map(current.rows.map((row) => [row.version, row.checksum]));
		let count = 0;
		for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
			const checksum = createHash('sha256').update(migration.sql).digest('hex');
			const previous = applied.get(migration.version);
			if (previous && previous !== checksum) throw new Error('Una migración aplicada ha cambiado.');
			if (previous) continue;
			await client.query(migration.sql);
			await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [migration.version, checksum]);
			count += 1;
		}
		return count;
	});
}
