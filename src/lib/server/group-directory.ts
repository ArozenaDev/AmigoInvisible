import { randomUUID } from 'node:crypto';

import {
	assertGroupRecord,
	isValidSlug,
	type GroupRecord,
} from '../domain/group.ts';
import { getLocalData, updateLocalData } from './local-json-store.ts';

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
	create(input: CreateGroupInput): GroupRecord | null {
		if (!isValidSlug(input.slug) || getLocalData().groups.some((group) => group.slug === input.slug)) {
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
		const wasCreated = updateLocalData((data) => {
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

	findAvailableBySlug(slug: string): GroupRecord | null {
		const group = getLocalData().groups.find((currentGroup) => currentGroup.slug === slug);
		return group && group.archivedAt === null ? group : null;
	}

	findBySlug(slug: string): GroupRecord | null {
		return getLocalData().groups.find((group) => group.slug === slug) ?? null;
	}

	list(): GroupRecord[] {
		return [...getLocalData().groups].sort((first, second) => first.name.localeCompare(second.name, 'es'));
	}

	setArchived(slug: string, archived: boolean): GroupRecord | null {
		return updateLocalData((data) => {
			const group = data.groups.find((currentGroup) => currentGroup.slug === slug);
			if (!group) {
				return null;
			}

			group.archivedAt = archived ? new Date().toISOString() : null;
			group.updatedAt = new Date().toISOString();
			return group;
		});
	}

	updateSettings(slug: string, input: UpdateGroupSettingsInput): GroupRecord | null {
		const name = input.name.trim();
		if (
			!name ||
			name.length > 120 ||
			(input.suggestedBudgetAmount !== null &&
				(!Number.isFinite(input.suggestedBudgetAmount) || input.suggestedBudgetAmount < 0))
		) {
			return null;
		}

		return updateLocalData((data) => {
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

	updateAccessPasswordHash(slug: string, accessPasswordHash: string): GroupRecord | null {
		if (!accessPasswordHash) {
			return null;
		}

		return updateLocalData((data) => {
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

export function createLocalGroup(input: CreateGroupInput): GroupRecord | null {
	return directory.create(input);
}

export function findAvailableLocalGroup(slug: string): GroupRecord | null {
	return directory.findAvailableBySlug(slug);
}

export function findLocalGroup(slug: string): GroupRecord | null {
	return directory.findBySlug(slug);
}

export function listLocalGroups(): GroupRecord[] {
	return directory.list();
}

export function setLocalGroupArchived(slug: string, archived: boolean): GroupRecord | null {
	return directory.setArchived(slug, archived);
}

export function updateLocalGroupSettings(slug: string, input: UpdateGroupSettingsInput): GroupRecord | null {
	return directory.updateSettings(slug, input);
}

export function updateLocalGroupAccessPasswordHash(slug: string, accessPasswordHash: string): GroupRecord | null {
	return directory.updateAccessPasswordHash(slug, accessPasswordHash);
}
