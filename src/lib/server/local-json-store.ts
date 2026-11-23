import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { GroupRecord } from '../domain/group.ts';
import { assertEditionDocument, type EditionDocument } from '../domain/edition.ts';
import type { GiftIdea } from '../domain/gift-idea.ts';
import type { ParticipantProfile } from '../domain/participant.ts';

export interface StoredSessionRecord {
	createdAt: string;
	expiresAt: string;
	groupId?: string;
	id: string;
	type: 'admin' | 'group';
}

export interface LocalDataState {
	editions: EditionDocument[];
	exclusionPairs: string[];
	giftIdeas: GiftIdea[];
	groups: GroupRecord[];
	participants: ParticipantProfile[];
	schemaVersion: 5;
	sessions: StoredSessionRecord[];
}

const LOCAL_DATA_PATH = resolve(process.cwd(), 'private-data', 'amigo-invisible.local.json');

let localData = loadLocalData();

export function getLocalData(): LocalDataState {
	return localData;
}

/**
 * Applies an in-process transaction to the ignored local JSON file. The
 * replacement is written to a temporary file and renamed only after the write
 * succeeds, so a partial write cannot replace the previous document.
 */
export function updateLocalData<Result>(mutation: (draft: LocalDataState) => Result): Result {
	const draft = structuredClone(localData);
	const result = mutation(draft);
	persistLocalData(draft);
	localData = draft;
	return result;
}

function loadLocalData(): LocalDataState {
	try {
		const raw = readFileSync(LOCAL_DATA_PATH, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		const migrated = migrateLocalData(parsed);
		if (!isLocalDataState(migrated)) {
			throw new Error('El archivo JSON local tiene un formato no válido.');
		}
		return migrated;
	} catch (error) {
		if (isMissingFileError(error)) {
			return emptyLocalData();
		}
		throw error;
	}
}

function persistLocalData(data: LocalDataState): void {
	const directory = dirname(LOCAL_DATA_PATH);
	const temporaryPath = `${LOCAL_DATA_PATH}.${randomUUID()}.tmp`;
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
	renameSync(temporaryPath, LOCAL_DATA_PATH);
}

function emptyLocalData(): LocalDataState {
	return {
		editions: [],
		exclusionPairs: [],
		giftIdeas: [],
		groups: [],
		participants: [],
		schemaVersion: 5,
		sessions: [],
	};
}

function isLocalDataState(value: unknown): value is LocalDataState {
	if (!isRecord(value) || value.schemaVersion !== 5) {
		return false;
	}

	return (
		Array.isArray(value.editions) &&
		value.editions.every(isEditionDocument) &&
		Array.isArray(value.groups) &&
		value.groups.every(isGroupRecord) &&
		Array.isArray(value.participants) &&
		value.participants.every(isParticipantProfile) &&
		Array.isArray(value.exclusionPairs) &&
		value.exclusionPairs.every((pair) => typeof pair === 'string') &&
		Array.isArray(value.giftIdeas) &&
		value.giftIdeas.every(isGiftIdea) &&
		Array.isArray(value.sessions) &&
		value.sessions.every(isStoredSessionRecord)
	);
}

function migrateLocalData(value: unknown): unknown {
	let migrated = value;
	if (isRecord(migrated) && migrated.schemaVersion === 1) {
		migrated = {
			...migrated,
			giftIdeas: Array.isArray(migrated.giftIdeas) ? migrated.giftIdeas : [],
			schemaVersion: 2,
		};
	}

	if (isRecord(migrated) && migrated.schemaVersion === 2) {
		migrated = {
			...migrated,
			editions: Array.isArray(migrated.editions) ? migrated.editions : [],
			schemaVersion: 3,
		};
	}

	if (isRecord(migrated) && migrated.schemaVersion === 3 && Array.isArray(migrated.participants)) {
		migrated = {
			...migrated,
			participants: migrated.participants.map((participant) =>
				isRecord(participant)
					? {
							...participant,
							accessPinHash:
								typeof participant.accessPinHash === 'string' || participant.accessPinHash === null
									? participant.accessPinHash
									: null,
						}
					: participant,
			),
			schemaVersion: 4,
		};
	}

	if (isRecord(migrated) && migrated.schemaVersion === 4 && Array.isArray(migrated.editions)) {
		const editions = migrated.editions.map(migrateEditionToSimplifiedLifecycle);
		const activeEditionIds = new Set(
			editions.flatMap((edition) =>
				isRecord(edition) && edition.status === 'active' && typeof edition.id === 'string' ? [edition.id] : [],
			),
		);
		return {
			...migrated,
			editions,
			groups: Array.isArray(migrated.groups)
				? migrated.groups.map((group) =>
					isRecord(group) && typeof group.activeEditionId === 'string' && !activeEditionIds.has(group.activeEditionId)
						? { ...group, activeEditionId: null }
						: group,
				)
				: migrated.groups,
			schemaVersion: 5,
		};
	}

	return migrated;
}

function migrateEditionToSimplifiedLifecycle(edition: unknown): unknown {
	if (!isRecord(edition)) return edition;
	const oldStatus = edition.status;
	const activatedAt = typeof edition.activatedAt === 'string'
		? edition.activatedAt
		: typeof edition.publishedAt === 'string'
			? edition.publishedAt
			: null;
	const revealEvents = Array.isArray(edition.revealEvents) ? edition.revealEvents : [];
	const revealCountByParticipantId = new Map<string, number>();
	for (const event of revealEvents) {
		if (isRecord(event) && event.type === 'revealed' && typeof event.participantId === 'string') {
			revealCountByParticipantId.set(event.participantId, (revealCountByParticipantId.get(event.participantId) ?? 0) + 1);
		}
	}
	const revealStates = Array.isArray(edition.revealStates)
		? edition.revealStates.map((state) => {
			if (!isRecord(state) || typeof state.participantId !== 'string') return state;
			const revealCount = revealCountByParticipantId.get(state.participantId) ?? (state.everRevealed === true ? 1 : 0);
			return {
				lastRevealedAt: typeof state.lastRevealedAt === 'string' ? state.lastRevealedAt : null,
				participantId: state.participantId,
				revealCount,
			};
		})
		: edition.revealStates;
	const auditEvents = Array.isArray(edition.auditEvents)
		? edition.auditEvents.map((event) => {
			if (!isRecord(event)) return event;
			if (event.type === 'published' || event.type === 'reopened') return { ...event, type: 'activated' };
			return event;
		})
		: edition.auditEvents;
	const { publishedAt: _publishedAt, ...rest } = edition;
	return {
		...rest,
		activatedAt,
		auditEvents,
		revealStates,
		schemaVersion: 2,
		status: oldStatus === 'closed' ? 'closed' : oldStatus === 'published' ? 'active' : 'inactive',
	};
}

function isEditionDocument(value: unknown): value is EditionDocument {
	try {
		assertEditionDocument(value as EditionDocument);
		return true;
	} catch {
		return false;
	}
}

function isGroupRecord(value: unknown): value is GroupRecord {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		typeof value.slug === 'string' &&
		typeof value.accessPasswordHash === 'string' &&
		(value.activeEditionId === null || typeof value.activeEditionId === 'string') &&
		(value.archivedAt === null || typeof value.archivedAt === 'string') &&
		typeof value.createdAt === 'string' &&
		typeof value.updatedAt === 'string' &&
		(value.suggestedBudgetAmount === null || typeof value.suggestedBudgetAmount === 'number')
	);
}

function isParticipantProfile(value: unknown): value is ParticipantProfile {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		(value.accessPinHash === null || typeof value.accessPinHash === 'string') &&
		typeof value.groupId === 'string' &&
		typeof value.displayName === 'string' &&
		(value.alias === null || typeof value.alias === 'string') &&
		typeof value.createdAt === 'string' &&
		typeof value.updatedAt === 'string'
	);
}

function isGiftIdea(value: unknown): value is GiftIdea {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.groupId === 'string' &&
		typeof value.participantId === 'string' &&
		typeof value.title === 'string' &&
		typeof value.affiliateUrl === 'string' &&
		typeof value.imageUrl === 'string' &&
		typeof value.sortOrder === 'number' &&
		typeof value.createdAt === 'string' &&
		typeof value.updatedAt === 'string'
	);
}

function isStoredSessionRecord(value: unknown): value is StoredSessionRecord {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.createdAt === 'string' &&
		typeof value.expiresAt === 'string' &&
		(value.type === 'admin' || value.type === 'group') &&
		(value.type !== 'group' || typeof value.groupId === 'string')
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
