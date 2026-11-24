import { randomUUID } from 'node:crypto';

import {
	isValidParticipantName,
	type ParticipantProfile,
} from '../domain/participant.ts';
import { readPersistentData, updatePersistentData } from './persistent-data-store.ts';

export interface CreateParticipantInput {
	alias: string | null;
	displayName: string;
	groupId: string;
}

export interface UpdateParticipantInput {
	alias: string | null;
	displayName: string;
}

/** Private local-development directory backed by the ignored JSON file. */
class LocalParticipantDirectory {
	async create(input: CreateParticipantInput): Promise<ParticipantProfile | null> {
		const alias = input.alias?.trim() || null;
		if (!isValidParticipantName(input.displayName) || (alias !== null && !isValidParticipantName(alias))) {
			return null;
		}

		const now = new Date().toISOString();
		const participant: ParticipantProfile = {
			accessPinHash: null,
			alias,
			createdAt: now,
			displayName: input.displayName.trim(),
			groupId: input.groupId,
			id: randomUUID(),
			updatedAt: now,
		};

		const created = await updatePersistentData((data) => {
			if (!data.groups.some((group) => group.id === input.groupId && group.archivedAt === null)) return false;
			data.participants.push(participant);
			return true;
		});
		return created ? participant : null;
	}

	async listByGroup(groupId: string): Promise<ParticipantProfile[]> {
		return (await readPersistentData()).participants
			.filter((participant) => participant.groupId === groupId)
			.sort((first, second) => first.displayName.localeCompare(second.displayName, 'es'));
	}

	async findById(id: string): Promise<ParticipantProfile | null> {
		return (await readPersistentData()).participants.find((participant) => participant.id === id) ?? null;
	}

	async update(id: string, groupId: string, input: UpdateParticipantInput): Promise<ParticipantProfile | null> {
		const alias = input.alias?.trim() || null;
		if (!isValidParticipantName(input.displayName) || (alias !== null && !isValidParticipantName(alias))) {
			return null;
		}

		return await updatePersistentData((data) => {
			const participant = data.participants.find((currentParticipant) => currentParticipant.id === id);
			if (!participant || participant.groupId !== groupId) {
				return null;
			}

			participant.alias = alias;
			participant.displayName = input.displayName.trim();
			participant.updatedAt = new Date().toISOString();
			return participant;
		});
	}

	async remove(id: string, groupId: string): Promise<boolean> {
		return await updatePersistentData((data) => {
			const participant = data.participants.find((currentParticipant) => currentParticipant.id === id);
			if (!participant || participant.groupId !== groupId) {
				return false;
			}
			// Edition participants are historical snapshots that still need this
			// reusable profile for PIN verification and live gift ideas. Removing the
			// profile first would leave an edition with an unusable participant.
			if (data.editions.some((edition) =>
				edition.groupId === groupId && edition.participants.some((editionParticipant) => editionParticipant.profileId === id),
			)) {
				return false;
			}

			data.participants = data.participants.filter((currentParticipant) => currentParticipant.id !== id);
			data.exclusionPairs = data.exclusionPairs.filter((pair) => !this.#pairIncludesParticipant(pair, id));
			data.giftIdeas = data.giftIdeas.filter((idea) => idea.participantId !== id);
			return true;
		});
	}

	async listExcludedIds(id: string, groupId: string): Promise<string[]> {
		const participant = await this.findById(id);
		if (!participant || participant.groupId !== groupId) {
			return [];
		}

		return (await readPersistentData()).exclusionPairs
			.flatMap((pair) => {
				const [firstId, secondId] = pair.split(':');
				if (firstId === id) return [secondId];
				if (secondId === id) return [firstId];
				return [];
			})
			.sort();
	}

	async setExclusions(id: string, groupId: string, excludedIds: string[]): Promise<boolean> {
		const uniqueExcludedIds = [...new Set(excludedIds)];
		return await updatePersistentData((draft) => {
			const participant = draft.participants.find((currentParticipant) => currentParticipant.id === id);
			const isValid = participant?.groupId === groupId && uniqueExcludedIds.every((excludedId) => {
				const excluded = draft.participants.find((currentParticipant) => currentParticipant.id === excludedId);
				return excludedId !== id && excluded?.groupId === groupId;
			});
			if (!isValid) return false;
			draft.exclusionPairs = draft.exclusionPairs.filter((pair) => !this.#pairIncludesParticipant(pair, id));
			for (const excludedId of uniqueExcludedIds) {
				draft.exclusionPairs.push(this.#pairKey(id, excludedId));
			}
			return true;
		});
	}

	async setAccessPinHash(id: string, groupId: string, accessPinHash: string): Promise<ParticipantProfile | null> {
		if (!accessPinHash) {
			return null;
		}

		return await updatePersistentData((data) => {
			const participant = data.participants.find((currentParticipant) => currentParticipant.id === id);
			if (!participant || participant.groupId !== groupId) {
				return null;
			}

			participant.accessPinHash = accessPinHash;
			participant.updatedAt = new Date().toISOString();
			return participant;
		});
	}

	#pairKey(firstId: string, secondId: string): string {
		return [firstId, secondId].sort().join(':');
	}

	#pairIncludesParticipant(pair: string, participantId: string): boolean {
		const [firstId, secondId] = pair.split(':');
		return firstId === participantId || secondId === participantId;
	}
}

const directory = new LocalParticipantDirectory();

export async function createLocalParticipant(input: CreateParticipantInput): Promise<ParticipantProfile | null> {
	return await directory.create(input);
}

export async function listLocalParticipants(groupId: string): Promise<ParticipantProfile[]> {
	return await directory.listByGroup(groupId);
}

export async function findLocalParticipant(id: string): Promise<ParticipantProfile | null> {
	return await directory.findById(id);
}

export async function removeLocalParticipant(id: string, groupId: string): Promise<boolean> {
	return await directory.remove(id, groupId);
}

export async function updateLocalParticipant(
	id: string,
	groupId: string,
	input: UpdateParticipantInput,
): Promise<ParticipantProfile | null> {
	return await directory.update(id, groupId, input);
}

export async function listLocalParticipantExclusions(id: string, groupId: string): Promise<string[]> {
	return await directory.listExcludedIds(id, groupId);
}

export async function setLocalParticipantExclusions(id: string, groupId: string, excludedIds: string[]): Promise<boolean> {
	return await directory.setExclusions(id, groupId, excludedIds);
}

export async function setLocalParticipantAccessPinHash(
	id: string,
	groupId: string,
	accessPinHash: string,
): Promise<ParticipantProfile | null> {
	return await directory.setAccessPinHash(id, groupId, accessPinHash);
}
