import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import test from 'node:test';

const projectRoot = process.cwd();
const directory = await (async () => {
	const { mkdtempSync } = await import('node:fs');
	return mkdtempSync(join(tmpdir(), 'amigo-migration-'));
})();
const now = '2026-11-20T00:00:00.000Z';
const participantId = 'edition-participant';
const legacyData = {
	editions: [{
		assignments: [], auditEvents: [], closedAt: null, createdAt: now, exclusions: [], giftIdeasSnapshot: [], groupId: 'group', id: 'edition', participants: [{ alias: null, displayName: 'Ana', id: participantId, profileId: 'profile' }], publishedAt: null, revealEvents: [{ occurredAt: now, participantId, type: 'revealed' }], revealStates: [{ canReveal: false, everRevealed: true, lastRevealedAt: now, participantId }], schemaVersion: 1, status: 'draft', year: 2026,
	}],
	exclusionPairs: [], giftIdeas: [], groups: [{ accessPasswordHash: 'hash', activeEditionId: null, archivedAt: null, createdAt: now, id: 'group', name: 'Grupo', slug: 'grupo', suggestedBudgetAmount: null, updatedAt: now }], participants: [], schemaVersion: 4, sessions: [],
};
mkdirSync(join(directory, 'private-data'), { recursive: true });
writeFileSync(join(directory, 'private-data', 'amigo-invisible.local.json'), JSON.stringify(legacyData));
process.chdir(directory);
const { getLocalData } = await import(`${projectRoot}/src/lib/server/local-json-store.ts?migration-test`);

test.after(() => {
	process.chdir(projectRoot);
	rmSync(directory, { force: true, recursive: true });
});

test('migra JSON local antiguo al ciclo simplificado', () => {
	const migrated = getLocalData();
	assert.equal(migrated.schemaVersion, 5);
	assert.equal(migrated.editions[0].schemaVersion, 2);
	assert.equal(migrated.editions[0].status, 'inactive');
	assert.equal(migrated.editions[0].revealStates[0].revealCount, 1);
	assert.equal(migrated.editions[0].revealStates[0].lastRevealedAt, now);
});
