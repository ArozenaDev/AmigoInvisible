import type { PoolClient } from 'pg';
import { isLocalDataState, type LocalDataState } from './local-json-store.ts';
import { getDatabasePool, withTransaction } from './postgres.ts';

// All state-based operations share this transaction lock. This is intentionally
// conservative until domain operations are moved to independent SQL queries.
const STATE_LOCK = 74120852;

function iso(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (!Number.isFinite(date.getTime())) throw new Error('Fecha almacenada no válida.');
	return date.toISOString();
}

export async function loadPostgresState(client: PoolClient): Promise<LocalDataState> {
	// One round trip for the complete snapshot. The transaction lock must be
	// acquired in a separate statement before this one to avoid a stale snapshot.
	const { rows: [snapshot] } = await client.query(`SELECT
		COALESCE((SELECT jsonb_agg(to_jsonb(g) || jsonb_build_object('active_edition_id',
			(SELECT id FROM editions e WHERE e.group_id = g.id AND e.status = 'active'))) FROM groups g), '[]'::jsonb) AS groups,
		COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM participants p), '[]'::jsonb) AS participants,
		COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM participant_exclusions x), '[]'::jsonb) AS exclusions,
		COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM gift_ideas i), '[]'::jsonb) AS ideas,
		COALESCE((SELECT jsonb_agg(document) FROM editions), '[]'::jsonb) AS editions,
		COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM sessions s), '[]'::jsonb) AS sessions`);
	const state: unknown = {
		schemaVersion: 5,
		groups: snapshot.groups.map((g: any) => ({ id: g.id, slug: g.slug, name: g.name, accessPasswordHash: g.access_password_hash,
			activeEditionId: g.active_edition_id, suggestedBudgetAmount: g.suggested_budget_amount === null ? null : Number(g.suggested_budget_amount),
			archivedAt: g.archived_at ? iso(g.archived_at) : null, createdAt: iso(g.created_at), updatedAt: iso(g.updated_at) })),
		participants: snapshot.participants.map((p: any) => ({ id: p.id, groupId: p.group_id, displayName: p.display_name, alias: p.alias,
			accessPinHash: p.access_pin_hash, createdAt: iso(p.created_at), updatedAt: iso(p.updated_at) })),
		exclusionPairs: snapshot.exclusions.map((e: any) => `${e.first_participant_id}:${e.second_participant_id}`),
		giftIdeas: snapshot.ideas.map((i: any) => ({ id: i.id, groupId: i.group_id, participantId: i.participant_id, title: i.title,
			affiliateUrl: i.affiliate_url, imageUrl: i.image_url, sortOrder: i.sort_order, createdAt: iso(i.created_at), updatedAt: iso(i.updated_at) })),
		editions: snapshot.editions,
		sessions: snapshot.sessions.map((s: any) => ({ id: s.id, type: s.type, ...(s.type === 'group' ? { groupId: s.group_id } : {}),
			createdAt: iso(s.created_at), expiresAt: iso(s.expires_at) })),
	};
	if (!isLocalDataState(state)) throw new Error('Datos almacenados no válidos.');
	return state;
}

function removed<T>(before: readonly T[], after: readonly T[], key: (value: T) => string): T[] {
	const keys = new Set(after.map(key));
	return before.filter((value) => !keys.has(key(value)));
}
function changed<T>(before: readonly T[], after: readonly T[], key: (value: T) => string): T[] {
	const originals = new Map(before.map((value) => [key(value), JSON.stringify(value)]));
	return after.filter((value) => originals.get(key(value)) !== JSON.stringify(value));
}

export async function persistPostgresChanges(client: PoolClient, before: LocalDataState, after: LocalDataState): Promise<void> {
	if (!isLocalDataState(after)) throw new Error('No se pueden guardar datos no válidos.');
	for (const group of after.groups) {
		const active = after.editions.filter((edition) => edition.groupId === group.id && edition.status === 'active');
		if (active.length > 1 || (active[0]?.id ?? null) !== group.activeEditionId) throw new Error('Estado de familia no válido.');
	}
	// Delete children before parents. No table is emptied or recreated.
	for (const s of removed(before.sessions, after.sessions, (x) => x.id)) await client.query('DELETE FROM sessions WHERE id = $1', [s.id]);
	for (const pair of removed(before.exclusionPairs, after.exclusionPairs, (x) => x)) {
		const [a, b] = pair.split(':');
		await client.query('DELETE FROM participant_exclusions WHERE first_participant_id = $1 AND second_participant_id = $2', [a, b]);
	}
	for (const i of removed(before.giftIdeas, after.giftIdeas, (x) => x.id)) await client.query('DELETE FROM gift_ideas WHERE id = $1', [i.id]);
	for (const e of removed(before.editions, after.editions, (x) => x.id)) await client.query('DELETE FROM editions WHERE id = $1', [e.id]);
	for (const p of removed(before.participants, after.participants, (x) => x.id)) await client.query('DELETE FROM participants WHERE id = $1', [p.id]);
	for (const g of removed(before.groups, after.groups, (x) => x.id)) await client.query('DELETE FROM groups WHERE id = $1', [g.id]);
	for (const g of changed(before.groups, after.groups, (x) => x.id)) await client.query(`INSERT INTO groups (id, slug, name, access_password_hash, suggested_budget_amount, archived_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name,
		access_password_hash = EXCLUDED.access_password_hash, suggested_budget_amount = EXCLUDED.suggested_budget_amount,
		archived_at = EXCLUDED.archived_at, updated_at = EXCLUDED.updated_at`, [g.id,g.slug,g.name,g.accessPasswordHash,g.suggestedBudgetAmount,g.archivedAt,g.createdAt,g.updatedAt]);
	for (const p of changed(before.participants, after.participants, (x) => x.id)) await client.query(`INSERT INTO participants (id, group_id, display_name, alias, access_pin_hash, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET group_id = EXCLUDED.group_id, display_name = EXCLUDED.display_name,
		alias = EXCLUDED.alias, access_pin_hash = EXCLUDED.access_pin_hash, updated_at = EXCLUDED.updated_at`, [p.id,p.groupId,p.displayName,p.alias,p.accessPinHash,p.createdAt,p.updatedAt]);
	for (const pair of changed(before.exclusionPairs, after.exclusionPairs, (x) => x)) {
		const [a, b] = pair.split(':');
		const participant = after.participants.find((p) => p.id === a);
		if (!participant || after.participants.find((p) => p.id === b)?.groupId !== participant.groupId) throw new Error('Exclusión no válida.');
		await client.query('INSERT INTO participant_exclusions (group_id, first_participant_id, second_participant_id) VALUES ($1,$2,$3)', [participant.groupId,a,b]);
	}
	for (const i of changed(before.giftIdeas, after.giftIdeas, (x) => x.id)) await client.query(`INSERT INTO gift_ideas (id,group_id,participant_id,title,affiliate_url,image_url,sort_order,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, affiliate_url = EXCLUDED.affiliate_url,
		image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, updated_at = EXCLUDED.updated_at`, [i.id,i.groupId,i.participantId,i.title,i.affiliateUrl,i.imageUrl,i.sortOrder,i.createdAt,i.updatedAt]);
	const editionChanges = changed(before.editions, after.editions, (x) => x.id).sort((a,b) => Number(a.status === 'active') - Number(b.status === 'active'));
	for (const e of editionChanges) await client.query(`INSERT INTO editions (id,group_id,year,status,document) VALUES ($1,$2,$3,$4,$5::jsonb)
		ON CONFLICT (id) DO UPDATE SET group_id = EXCLUDED.group_id, year = EXCLUDED.year, status = EXCLUDED.status, document = EXCLUDED.document`, [e.id,e.groupId,e.year,e.status,JSON.stringify(e)]);
	for (const s of changed(before.sessions, after.sessions, (x) => x.id)) await client.query(`INSERT INTO sessions (id,type,group_id,created_at,expires_at)
		VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, group_id = EXCLUDED.group_id, expires_at = EXCLUDED.expires_at`, [s.id,s.type,s.groupId ?? null,s.createdAt,s.expiresAt]);
}

/** Transactional compatibility adapter for the existing domain operations. */
export function createPostgresDataStore(connect: () => Promise<PoolClient>) {
	return {
		async read(): Promise<LocalDataState> {
			return withTransaction(connect, async (client) => {
				await client.query('SELECT pg_advisory_xact_lock($1)', [STATE_LOCK]);
				return loadPostgresState(client);
			});
		},
		async update<T>(mutation: (draft: LocalDataState) => T): Promise<T> {
			return withTransaction(connect, async (client) => {
				await client.query('SELECT pg_advisory_xact_lock($1)', [STATE_LOCK]);
				const before = await loadPostgresState(client);
				const after = structuredClone(before);
				const result = mutation(after);
				await persistPostgresChanges(client, before, after);
				return result;
			});
		},
	};
}

const store = createPostgresDataStore(() => getDatabasePool().connect());
export const readPostgresData = store.read;
export const updatePostgresData = store.update;
