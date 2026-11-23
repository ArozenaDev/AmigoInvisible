import { randomBytes } from 'node:crypto';

import { type StoredSessionRecord } from './local-json-store.ts';
import { readPersistentData, updatePersistentData } from './persistent-data-store.ts';

const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
const SESSION_DURATION_MILLISECONDS = SESSION_DURATION_SECONDS * 1000;

export const ADMIN_SESSION_COOKIE = 'ai_admin_session';
export const GROUP_SESSION_COOKIE = 'ai_group_session';

interface BaseSession {
	createdAt: Date;
	expiresAt: Date;
	id: string;
}

export interface AdminSession extends BaseSession {
	type: 'admin';
}

export interface GroupSession extends BaseSession {
	groupId: string;
	type: 'group';
}

export type Session = AdminSession | GroupSession;

/**
 * Local development sessions are stored with the other private data so their
 * 30-day absolute expiry survives an Astro restart. Cookies still hold only
 * their opaque random session ID.
 */
class LocalSessionRegistry {
	async createAdmin(): Promise<AdminSession> {
		return await this.store({ type: 'admin' }) as AdminSession;
	}

	async createGroup(groupId: string): Promise<GroupSession> {
		return await this.store({ groupId, type: 'group' }) as GroupSession;
	}

	async get(sessionId: string | undefined): Promise<Session | null> {
		if (!sessionId) {
			return null;
		}

		const storedSession = (await readPersistentData()).sessions.find((session) => session.id === sessionId);
		const session = storedSession ? toSession(storedSession) : null;
		if (!session || session.expiresAt.getTime() <= Date.now()) {
			if (storedSession) {
				await this.revoke(sessionId);
			}
			return null;
		}

		return session;
	}

	async revoke(sessionId: string | undefined): Promise<void> {
		if (!sessionId || !(await readPersistentData()).sessions.some((session) => session.id === sessionId)) {
			return;
		}

		await updatePersistentData((data) => {
			data.sessions = data.sessions.filter((session) => session.id !== sessionId);
		});
	}

	private async store(details: Pick<StoredSessionRecord, 'groupId' | 'type'>): Promise<Session> {
		const createdAt = new Date();
		const storedSession: StoredSessionRecord = {
			...details,
			createdAt: createdAt.toISOString(),
			expiresAt: new Date(createdAt.getTime() + SESSION_DURATION_MILLISECONDS).toISOString(),
			id: randomBytes(32).toString('base64url'),
		};

		await updatePersistentData((data) => {
			data.sessions = data.sessions.filter((session) => {
				const expiresAt = new Date(session.expiresAt).getTime();
				return Number.isFinite(expiresAt) && expiresAt > Date.now();
			});
			data.sessions.push(storedSession);
		});

		const session = toSession(storedSession);
		if (!session) {
			throw new Error('No se ha podido crear la sesión local.');
		}
		return session;
	}
}

const registry = new LocalSessionRegistry();

export async function createAdminSession(): Promise<AdminSession> {
	return await registry.createAdmin();
}

export async function createGroupSession(groupId: string): Promise<GroupSession> {
	return await registry.createGroup(groupId);
}

export async function getAdminSession(sessionId: string | undefined): Promise<AdminSession | null> {
	const session = await registry.get(sessionId);
	return session?.type === 'admin' ? session : null;
}

export async function getGroupSession(sessionId: string | undefined, groupId: string): Promise<GroupSession | null> {
	const session = await registry.get(sessionId);
	return session?.type === 'group' && session.groupId === groupId ? session : null;
}

export async function revokeSession(sessionId: string | undefined): Promise<void> {
	await registry.revoke(sessionId);
}

export function sessionCookieOptions(path = '/'): {
	httpOnly: true;
	maxAge: number;
	path: string;
	sameSite: 'lax';
	secure: boolean;
} {
	return {
		httpOnly: true,
		maxAge: SESSION_DURATION_SECONDS,
		path,
		sameSite: 'lax',
		secure: import.meta.env.PROD,
	};
}

function toSession(storedSession: StoredSessionRecord): Session | null {
	const createdAt = new Date(storedSession.createdAt);
	const expiresAt = new Date(storedSession.expiresAt);
	if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(expiresAt.getTime())) {
		return null;
	}

	if (storedSession.type === 'group') {
		return typeof storedSession.groupId === 'string'
			? { ...storedSession, createdAt, expiresAt, groupId: storedSession.groupId, type: 'group' }
			: null;
	}

	return { ...storedSession, createdAt, expiresAt, type: 'admin' };
}
