import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { emptyLocalData } from '../src/lib/server/local-json-store.ts';
import { loadPostgresState, persistPostgresChanges } from '../src/lib/server/postgres-data-store.ts';

const schema = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');

test('carga el estado completo con una sola consulta y admite tablas vacías', async () => {
	const db = new PGlite();
	try {
		await db.exec(schema);
		let queries = 0;
		const client = { query: (...args: Parameters<typeof db.query>) => { queries++; return db.query(...args); } };
		assert.deepEqual(await loadPostgresState(client as never), emptyLocalData());
		assert.equal(queries, 1);
	} finally { await db.close(); }
});

test('el esquema guarda familias, participantes, exclusiones y sesiones en PostgreSQL', async () => {
	const db = new PGlite();
	try {
		await db.exec(schema);
		const before = emptyLocalData();
		const after = structuredClone(before);
		const now = '2026-01-01T00:00:00.000Z';
		after.groups.push({ id:'g', name:'Grupo', slug:'grupo', accessPasswordHash:'hash', activeEditionId:null, archivedAt:null, suggestedBudgetAmount:30, createdAt:now, updatedAt:now });
		for (const id of ['a','b','c']) after.participants.push({ id, groupId:'g', displayName:id, alias:null, accessPinHash:null, createdAt:now, updatedAt:now });
		after.exclusionPairs.push('a:b');
		after.sessions.push({ id:'session-test', type:'group', groupId:'g', createdAt:now, expiresAt:'2027-01-01T00:00:00.000Z' });
		await persistPostgresChanges(db as never, before, after);
		const saved = await loadPostgresState(db as never);
		assert.equal(saved.groups.length, 1);
		assert.equal(saved.groups[0].suggestedBudgetAmount, 30);
		assert.equal(saved.participants.length, 3);
		assert.deepEqual(saved.exclusionPairs, ['a:b']);
		assert.equal(saved.sessions[0].groupId, 'g');
		const updated = structuredClone(saved);
		updated.participants[0].displayName = 'Actualizado';
		updated.exclusionPairs = [];
		await persistPostgresChanges(db as never, saved, updated);
		const reread = await loadPostgresState(db as never);
		assert.equal(reread.participants.find((p) => p.id === 'a')?.displayName, 'Actualizado');
		assert.deepEqual(reread.exclusionPairs, []);
	} finally { await db.close(); }
});

test('un fallo en una operación revierte todas las escrituras de la transacción', async () => {
	const db = new PGlite();
	try {
		await db.exec(schema);
		await assert.rejects(db.transaction(async (tx) => {
			await tx.query("INSERT INTO groups (id,slug,name,access_password_hash,created_at,updated_at) VALUES ('g','grupo','Grupo','hash',now(),now())");
			await tx.query("INSERT INTO participants (id,group_id,display_name,created_at,updated_at) VALUES ('p','missing','P',now(),now())");
		}));
		const result = await db.query('SELECT id FROM groups');
		assert.equal(result.rows.length, 0);
	} finally { await db.close(); }
});

test('el adaptador transaccional confirma participantes y conserva datos previos', async () => {
	const { createPostgresDataStore } = await import('../src/lib/server/postgres-data-store.ts');
	const db = new PGlite();
	try {
		await db.exec(schema);
		const client = { query: db.query.bind(db), release() {} };
		const store = createPostgresDataStore(async () => client as never);
		const now = '2026-01-01T00:00:00.000Z';
		await store.update((state) => {
			state.groups.push({ id:'g', name:'Grupo', slug:'grupo', accessPasswordHash:'hash', activeEditionId:null, archivedAt:null, suggestedBudgetAmount:null, createdAt:now, updatedAt:now });
		});
		for (const id of ['a', 'b', 'c', 'd']) {
			await store.update((state) => {
				state.participants.push({ id, groupId:'g', displayName:id, alias:null, accessPinHash:null, createdAt:now, updatedAt:now });
			});
		}
		assert.equal((await store.read()).participants.length, 4);
		await assert.rejects(store.update((state) => { state.participants.push({ id:'bad', groupId:'missing', displayName:'Bad', alias:null, accessPinHash:null, createdAt:now, updatedAt:now }); }));
		assert.equal((await store.read()).participants.length, 4);
	} finally { await db.close(); }
});

test('limita intentos de forma compartida y no guarda el identificador en claro', async () => {
	const { reservePostgresAttempt, clearPostgresAttempts } = await import('../src/lib/server/postgres-rate-limit.ts');
	const db = new PGlite();
	try {
		await db.exec(schema);
		for (let i = 0; i < 5; i++) assert.equal(await reservePostgresAttempt('pin:family:person', db as never), true);
		assert.equal(await reservePostgresAttempt('pin:family:person', db as never), false);
		assert.equal(await reservePostgresAttempt('pin:family:other', db as never), true);
		const records = await db.query('SELECT attempt_key FROM security_attempts');
		assert.ok(records.rows.every((row) => !JSON.stringify(row).includes('family')));
		await clearPostgresAttempts('pin:family:person', db as never);
		assert.equal(await reservePostgresAttempt('pin:family:person', db as never), true);
		await db.query("UPDATE security_attempts SET started_at = CURRENT_TIMESTAMP - interval '16 minutes'");
		assert.equal(await reservePostgresAttempt('pin:family:other', db as never), true);
	} finally { await db.close(); }
});

test('el adaptador conserva sorteos, exclusiones y consultas al cambiar de estado', async () => {
	const { createPostgresDataStore } = await import('../src/lib/server/postgres-data-store.ts');
	const { generateRaffle } = await import('../src/lib/domain/raffle.ts');
	const db = new PGlite();
	try {
		await db.exec(schema);
		const client = { query: db.query.bind(db), release() {} };
		const store = createPostgresDataStore(async () => client as never);
		const now = '2026-01-01T00:00:00.000Z';
		await store.update((state) => {
			state.groups.push({ id:'g', name:'Grupo', slug:'grupo', accessPasswordHash:'hash', activeEditionId:null, archivedAt:null, suggestedBudgetAmount:null, createdAt:now, updatedAt:now });
			for (const id of ['a','b','c','d']) state.participants.push({ id, groupId:'g', displayName:id, alias:null, accessPinHash:null, createdAt:now, updatedAt:now });
			state.exclusionPairs.push('a:b');
		});
		await store.update((state) => {
			const participants = state.participants.map((p) => ({ id:`ed-${p.id}`, profileId:p.id, displayName:p.displayName, alias:p.alias }));
			const exclusions = [{ firstParticipantId:'ed-a', secondParticipantId:'ed-b' }];
			const assignments = generateRaffle({ participants, exclusions }).assignments;
			state.editions.push({ id:'edition', groupId:'g', year:2026, status:'inactive', schemaVersion:2, createdAt:now, activatedAt:null, closedAt:null,
				participants, exclusions, assignments, revealStates: participants.map((p) => ({ participantId:p.id, revealCount:0, lastRevealedAt:null })),
				revealEvents:[], auditEvents:[], giftIdeasSnapshot:[] });
		});
		await store.update((state) => { state.editions[0].status = 'active'; state.editions[0].activatedAt = now; state.groups[0].activeEditionId = 'edition'; });
		await store.update((state) => { state.editions[0].revealStates[0].revealCount++; state.editions[0].revealStates[0].lastRevealedAt = now; state.editions[0].revealEvents.push({ type:'revealed', participantId:'ed-a', occurredAt:now }); });
		const saved = await store.read();
		assert.equal(saved.groups[0].activeEditionId, 'edition');
		assert.equal(saved.editions[0].revealStates[0].revealCount, 1);
		assert.equal(saved.editions[0].assignments.length, 4);
		assert.ok(saved.editions[0].assignments.every((a) => !(['ed-a:ed-b', 'ed-b:ed-a'].includes(`${a.giverId}:${a.recipientId}`))));
		await store.update((state) => { state.editions[0].status = 'closed'; state.editions[0].closedAt = now; state.groups[0].activeEditionId = null; });
		assert.equal((await store.read()).editions[0].status, 'closed');
	} finally { await db.close(); }
});

test('las migraciones se ejecutan una sola vez y detectan cambios posteriores', async () => {
	const { applyMigrations } = await import('../src/lib/server/postgres-migrations.ts');
	const db = new PGlite();
	try {
		const client = { query: async (sql: string, params?: unknown[]) => {
			if (sql === schema) { await db.exec(sql); return { rows: [] }; }
			return db.query(sql, params);
		}, release() {} };
		const connect = async () => client as never;
		assert.equal(await applyMigrations([{ version: 1, sql: schema }], connect), 1);
		assert.equal(await applyMigrations([{ version: 1, sql: schema }], connect), 0);
		await assert.rejects(applyMigrations([{ version: 1, sql: schema + '\n-- modified' }], connect));
		const rows = await db.query('SELECT version FROM schema_migrations');
		assert.equal(rows.rows.length, 1);
	} finally { await db.close(); }
});
