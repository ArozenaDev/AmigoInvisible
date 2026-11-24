import assert from 'node:assert/strict';
import test from 'node:test';
import { withTransaction } from '../src/lib/server/postgres.ts';

test('confirma la transacción antes de devolver el resultado', async () => {
	const calls: string[] = [];
	const client = { query: async (sql: string) => { calls.push(sql); }, release: () => { calls.push('RELEASE'); } };
	const result = await withTransaction(async () => client, async () => { calls.push('OPERATION'); return 'ok'; });
	assert.equal(result, 'ok');
	assert.deepEqual(calls, ['BEGIN', 'OPERATION', 'COMMIT', 'RELEASE']);
});

test('revierte y libera la conexión si la operación falla', async () => {
	const calls: string[] = [];
	const client = { query: async (sql: string) => { calls.push(sql); }, release: () => { calls.push('RELEASE'); } };
	await assert.rejects(withTransaction(async () => client, async () => { throw new Error('failure'); }));
	assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('no devuelve un resultado cuando falla la confirmación', async () => {
	const calls: string[] = [];
	const client = {
		query: async (sql: string) => { calls.push(sql); if (sql === 'COMMIT') throw new Error('commit failed'); },
		release: () => { calls.push('RELEASE'); },
	};
	await assert.rejects(withTransaction(async () => client, async () => 'private result'));
	assert.deepEqual(calls, ['BEGIN', 'COMMIT', 'ROLLBACK', 'RELEASE']);
});
