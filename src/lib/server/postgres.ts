import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

/** Narrow transaction interface, also usable with a test double. */
export interface TransactionClient {
	query(sql: string): Promise<unknown>;
	release(): void;
}

let pool: pg.Pool | undefined;

/** Lazily create a server-only pool; never log its connection string. */
export function getDatabasePool(): pg.Pool {
	if (!pool) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) throw new Error('El almacenamiento no está configurado.');
		pool = new pg.Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
		// Release idle connections when a hosted function instance suspends.
		if (process.env.VERCEL === '1') attachDatabasePool(pool);
	}
	return pool;
}

/** Run a mutation atomically; never return a value until COMMIT succeeds. */
export async function withTransaction<T, Client extends TransactionClient>(
	connect: () => Promise<Client>,
	operation: (client: Client) => Promise<T>,
): Promise<T> {
	const client = await connect();
	try {
		await client.query('BEGIN');
		const result = await operation(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		try {
			await client.query('ROLLBACK');
		} catch {
			// Preserve the original failure and never report an unconfirmed commit.
		}
		throw error;
	} finally {
		client.release();
	}
}
