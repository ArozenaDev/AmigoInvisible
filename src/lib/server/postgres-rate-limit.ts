import { createHash } from 'node:crypto';
import { getDatabasePool } from './postgres.ts';

export interface RateLimitQuery {
	query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

function keyFor(scope: string): string {
	return createHash('sha256').update(scope).digest('hex');
}

/** Reserve an attempt atomically before verifying a password or PIN. */
export async function reservePostgresAttempt(scope: string, db: RateLimitQuery = getDatabasePool()): Promise<boolean> {
	const result = await db.query(`INSERT INTO security_attempts (attempt_key, started_at, attempts)
		VALUES ($1, CURRENT_TIMESTAMP, 1)
		ON CONFLICT (attempt_key) DO UPDATE SET
			started_at = CASE WHEN security_attempts.started_at <= CURRENT_TIMESTAMP - interval '15 minutes'
				THEN CURRENT_TIMESTAMP ELSE security_attempts.started_at END,
			attempts = CASE WHEN security_attempts.started_at <= CURRENT_TIMESTAMP - interval '15 minutes'
				THEN 1 ELSE security_attempts.attempts + 1 END
		WHERE security_attempts.started_at <= CURRENT_TIMESTAMP - interval '15 minutes' OR security_attempts.attempts < 5
		RETURNING attempts`, [keyFor(scope)]);
	return result.rows.length > 0;
}

export async function clearPostgresAttempts(scope: string, db: RateLimitQuery = getDatabasePool()): Promise<void> {
	await db.query('DELETE FROM security_attempts WHERE attempt_key = $1', [keyFor(scope)]);
}
