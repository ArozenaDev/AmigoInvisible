import { clearPostgresAttempts, reservePostgresAttempt } from './postgres-rate-limit.ts';
import { usesPostgres } from './persistent-data-store.ts';

const LOGIN_ATTEMPT_WINDOW_MILLISECONDS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

interface AttemptWindow {
	count: number;
	startedAt: number;
}

/** Ephemeral protection only: it intentionally writes no application logs. */
class LocalLoginRateLimiter {
	readonly #attempts = new Map<string, AttemptWindow>();

	canAttempt(key: string): boolean {
		const attempt = this.#attempts.get(key);
		if (!attempt || Date.now() - attempt.startedAt >= LOGIN_ATTEMPT_WINDOW_MILLISECONDS) {
			return true;
		}

		return attempt.count < MAX_LOGIN_ATTEMPTS;
	}

	recordFailure(key: string): void {
		const now = Date.now();
		const attempt = this.#attempts.get(key);
		if (!attempt || now - attempt.startedAt >= LOGIN_ATTEMPT_WINDOW_MILLISECONDS) {
			this.#attempts.set(key, { count: 1, startedAt: now });
			return;
		}

		attempt.count += 1;
	}

	clear(key: string): void {
		this.#attempts.delete(key);
	}
}

const loginRateLimiter = new LocalLoginRateLimiter();
const pinRateLimiter = new LocalLoginRateLimiter();

export function hasSameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	return origin !== null && origin === new URL(request.url).origin;
}

export function requestIdentifier(request: Request): string {
	return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function loginScope(identifier: string): string {
	return identifier.startsWith('group:') ? `group:${identifier.split(':')[1]}` : 'admin';
}

function pinScope(identifier: string): string {
	const [, groupId, participantId] = identifier.split(':');
	return `pin:${groupId}:${participantId}`;
}

export async function canAttemptLogin(identifier: string): Promise<boolean> {
	return usesPostgres()
		? reservePostgresAttempt(loginScope(identifier)) : loginRateLimiter.canAttempt(identifier);
}

export function recordFailedLogin(identifier: string): void {
	if (!usesPostgres()) loginRateLimiter.recordFailure(identifier);
}

export async function clearLoginFailures(identifier: string): Promise<void> {
	if (usesPostgres()) await clearPostgresAttempts(loginScope(identifier));
	else loginRateLimiter.clear(identifier);
}

export async function canAttemptParticipantPin(identifier: string): Promise<boolean> {
	return usesPostgres()
		? reservePostgresAttempt(pinScope(identifier)) : pinRateLimiter.canAttempt(identifier);
}

export function recordFailedParticipantPin(identifier: string): void {
	if (!usesPostgres()) pinRateLimiter.recordFailure(identifier);
}

export async function clearParticipantPinFailures(identifier: string): Promise<void> {
	if (usesPostgres()) await clearPostgresAttempts(pinScope(identifier));
	else pinRateLimiter.clear(identifier);
}
