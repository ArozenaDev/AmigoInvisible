import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createPostgresDataStore } from '../src/lib/server/postgres-data-store.ts';
import { reservePostgresAttempt } from '../src/lib/server/postgres-rate-limit.ts';

// Opt-in only. Use a dedicated test database, never production.
const url = process.env.TEST_DATABASE_URL;
test('Neon: las escrituras simultáneas no pierden participantes', { skip: !url, timeout: 90_000 }, async () => {
	if (!url) return;
	let hostname: string;
	try { hostname = new URL(url).hostname; }
	catch { throw new Error('La conexión de pruebas no tiene un formato válido.'); }
	if (hostname.includes('-pooler.')) throw new Error('La prueba necesita una conexión directa a la base de pruebas.');
	const schema = `test_${randomBytes(12).toString('hex')}`;
	const pool = new pg.Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 10_000 });
	let created = false;
	try {
		// schema is generated locally from hex characters, never user input.
		await pool.query(`CREATE SCHEMA "${schema}"`);
		created = true;
		const setup = await pool.connect();
		try {
			await setup.query(`SET search_path TO "${schema}", pg_catalog`);
			await setup.query(await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
		} finally { setup.release(); }
		const store = createPostgresDataStore(async () => {
			const client = await pool.connect();
			try { await client.query(`SET search_path TO "${schema}", pg_catalog`); return client; }
			catch (error) { client.release(); throw error; }
		});
		const now = new Date().toISOString();
		await store.update((state) => { state.groups.push({ id:'g', slug:'grupo', name:'Grupo', accessPasswordHash:'hash', activeEditionId:null, archivedAt:null, suggestedBudgetAmount:null, createdAt:now, updatedAt:now }); });
		await Promise.all(Array.from({ length: 12 }, (_, index) => store.update((state) => {
			state.participants.push({ id:`p${index}`, groupId:'g', displayName:`Persona ${index}`, alias:null, accessPinHash:null, createdAt:now, updatedAt:now });
		})));
		const state = await store.read();
		assert.equal(state.participants.length, 12);
		assert.equal(new Set(state.participants.map((p) => p.id)).size, 12);
		const scopedDb = { query: async (sql: string, params: unknown[]) => {
			const client = await pool.connect();
			try { await client.query(`SET search_path TO "${schema}", pg_catalog`); return await client.query(sql, params); }
			finally { client.release(); }
		} };
		const attempts = await Promise.all(Array.from({ length: 12 }, () => reservePostgresAttempt('pin:test', scopedDb)));
		assert.equal(attempts.filter(Boolean).length, 5);
	} finally {
		try { if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
		finally { await pool.end(); }
	}
});
