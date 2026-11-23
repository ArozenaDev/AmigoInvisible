import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();

export interface SeedParticipant {
	alias?: string | null;
	displayName: string;
	id: string;
}

export async function createLocalTestContext(prefix: string) {
	const directory = mkdtempSync(join(tmpdir(), `${prefix}-`));
	process.chdir(directory);
	// Import the directories first: they and the store must share the exact
	// same module instance, otherwise each test would mutate a different cache.
	const editions = await import(`${projectRoot}/src/lib/server/edition-directory.ts`);
	const localStore = await import(`${projectRoot}/src/lib/server/local-json-store.ts`);
	const participants = await import(`${projectRoot}/src/lib/server/participant-directory.ts`);

	return {
		directory,
		editions,
		participants,
		seed(groupId: string, profiles: readonly SeedParticipant[]) {
			const now = '2026-11-20T00:00:00.000Z';
			localStore.updateLocalData((data) => {
				data.groups.push({
					accessPasswordHash: 'test-hash',
					activeEditionId: null,
					archivedAt: null,
					createdAt: now,
					id: groupId,
					name: 'Grupo de pruebas',
					slug: `${groupId}-test`,
					suggestedBudgetAmount: null,
					updatedAt: now,
				});
				for (const profile of profiles) {
					data.participants.push({
						accessPinHash: null,
						alias: profile.alias ?? null,
						createdAt: now,
						displayName: profile.displayName,
						groupId,
						id: profile.id,
						updatedAt: now,
					});
				}
			});
		},
		cleanup() {
			process.chdir(projectRoot);
			rmSync(directory, { force: true, recursive: true });
		},
	};
}
