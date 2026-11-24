import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const directory = mkdtempSync(join(tmpdir(), 'amigo-backend-'));
process.chdir(directory);
const original = { VERCEL: process.env.VERCEL, STORAGE_BACKEND: process.env.STORAGE_BACKEND, DATABASE_URL: process.env.DATABASE_URL };
const storage = await import(`${root}/src/lib/server/persistent-data-store.ts`);
test.after(() => {
	for (const [key, value] of Object.entries(original)) {
		if (value === undefined) delete process.env[key]; else process.env[key] = value;
	}
	process.chdir(root);
	rmSync(directory, { recursive: true, force: true });
});

test('usa JSON local por defecto fuera del alojamiento remoto', async () => {
	delete process.env.VERCEL; delete process.env.STORAGE_BACKEND; delete process.env.DATABASE_URL;
	assert.equal(storage.usesPostgres(), false);
	assert.equal((await storage.readPersistentData()).groups.length, 0);
});

test('en el alojamiento remoto falla de forma segura si falta DATABASE_URL', async () => {
	process.env.VERCEL = '1'; delete process.env.DATABASE_URL;
	assert.equal(storage.usesPostgres(), true);
	await assert.rejects(storage.readPersistentData(), /almacenamiento no está configurado/);
});
