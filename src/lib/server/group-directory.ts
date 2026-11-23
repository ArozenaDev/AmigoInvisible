import { randomUUID } from 'node:crypto';

import {
	assertGroupRecord,
	isValidSlug,
	type GroupRecord,
} from '../domain/group.ts';
import { readPersistentData, updatePersistentData } from './persistent-data-store.ts';

export interface CreateGroupInput {
	accessPasswordHash: string;
	name: string;
	slug: string;
	suggestedBudgetAmount: number | null;
}

export interface UpdateGroupSettingsInput {
	name: string;
	suggestedBudgetAmount: number | null;
}

/**
 * Private local-development directory backed by an ignored JSON file. It has
 * no source fixtures, so family names and passwords never enter the repository.
 */
class LocalGroupDirectory {
	async create(input: CreateGroupInput): Promise<GroupRecord | null> {
		if (!isValidSlug(input.slug) || (await readPersistentData()).groups.some((group) => group.slug === input.slug)) {
			return null;
		}

		const now = new Date().toISOString();
		const group: GroupRecord = {
			accessPasswordHash: input.accessPasswordHash,
			activeEditionId: null,
			archivedAt: null,
			createdAt: now,
			id: randomUUID(),
			name: input.name.trim(),
			slug: input.slug,
			suggestedBudgetAmount: input.suggestedBudgetAmount,
			updatedAt: now,
		};

		assertGroupRecord(group);
		const wasCreated = await updatePersistentData((data) => {
			if (data.groups.some((currentGroup) => currentGroup.slug === group.slug)) {
				return false;
			}
			data.groups.push(group);
			return true;
		});
		if (!wasCreated) {
			return null;
		}
		return group;
	}

	async findAvailableBySlug(slug: string): Promise<GroupRecord | null> {
		const group = (await readPersistentData()).groups.find((currentGroup) => currentGroup.slug === slug);
		return group && group.archivedAt === null ? group : null;
	}

	async findBySlug(slug: string): Promise<GroupRecord | null> {
		return (await readPersistentData()).groups.find((group) => group.slug === slug) ?? null;
	}

	async list(): Promise<GroupRecord[]> {
		return [...(await readPersistentData()).groups].sort((first, second) => first.name.localeCompare(second.name, 'es'));
	}

	async setArchived(slug: string, archived: boolean): Promise<GroupRecord | null> {
		return await updatePersistentData((data) => {
			const group = data.groups.find((currentGroup) => currentGroup.slug === slug);
			if (!group) {
				return null;
			}

			group.archivedAt = archived ? new Date().toISOString() : null;
			group.updatedAt = new Date().toISOString();
			return group;
		});
	}

	async updateSettings(slug: string, input: UpdateGroupSettingsInput): Promise<GroupRecord | null> {
		const name = input.name.trim();
		if (
			!name ||
			name.length > 120 ||
			(input.suggestedBudgetAmount !== null &&
				(!Number.isFinite(input.suggestedBudgetAmount) || input.suggestedBudgetAmount < 0))
		) {
			return null;
		}

		return await updatePersistentData((data) => {
			const group = data.groups.find((currentGroup) => currentGroup.slug === slug);
			if (!group) {
				return null;
			}

			group.name = name;
			group.suggestedBudgetAmount = input.suggestedBudgetAmount;
			group.updatedAt = new Date().toISOString();
			return group;
		});
	}

	async updateAccessPasswordHash(slug: string, accessPasswordHash: string): Promise<GroupRecord | null> {
		if (!accessPasswordHash) {
			return null;
		}

		return await updatePersistentData((data) => {
			const group = data.groups.find((currentGroup) => currentGroup.slug === slug);
			if (!group) {
				return null;
			}

			group.accessPasswordHash = accessPasswordHash;
			group.updatedAt = new Date().toISOString();
			return group;
		});
	}
}

const directory = new LocalGroupDirectory();

export async function createLocalGroup(input: CreateGroupInput): Promise<GroupRecord | null> {
	return await directory.create(input);
}

export async function findAvailableLocalGroup(slug: string): Promise<GroupRecord | null> {
	return await directory.findAvailableBySlug(slug);
}

export async function findLocalGroup(slug: string): Promise<GroupRecord | null> {
	return await directory.findBySlug(slug);
}

export async function listLocalGroups(): Promise<GroupRecord[]> {
	return await directory.list();
}

export async function setLocalGroupArchived(slug: string, archived: boolean): Promise<GroupRecord | null> {
	return await directory.setArchived(slug, archived);
}

export async function updateLocalGroupSettings(slug: string, input: UpdateGroupSettingsInput): Promise<GroupRecord | null> {
	return await directory.updateSettings(slug, input);
}

export async function updateLocalGroupAccessPasswordHash(slug: string, accessPasswordHash: string): Promise<GroupRecord | null> {
	return await directory.updateAccessPasswordHash(slug, accessPasswordHash);
}
