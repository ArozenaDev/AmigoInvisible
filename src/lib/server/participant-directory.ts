import { randomUUID } from 'node:crypto';

import {
	isValidParticipantName,
	type ParticipantProfile,
} from '../domain/participant.ts';
import { getLocalData, updateLocalData } from './local-json-store.ts';

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
	create(input: CreateParticipantInput): ParticipantProfile | null {
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

		updateLocalData((data) => {
			data.participants.push(participant);
		});
		return participant;
	}

	listByGroup(groupId: string): ParticipantProfile[] {
		return getLocalData().participants
			.filter((participant) => participant.groupId === groupId)
			.sort((first, second) => first.displayName.localeCompare(second.displayName, 'es'));
	}

	findById(id: string): ParticipantProfile | null {
		return getLocalData().participants.find((participant) => participant.id === id) ?? null;
	}

	update(id: string, groupId: string, input: UpdateParticipantInput): ParticipantProfile | null {
		const alias = input.alias?.trim() || null;
		if (!isValidParticipantName(input.displayName) || (alias !== null && !isValidParticipantName(alias))) {
			return null;
		}

		return updateLocalData((data) => {
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

	remove(id: string, groupId: string): boolean {
		return updateLocalData((data) => {
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

	listExcludedIds(id: string, groupId: string): string[] {
		const participant = this.findById(id);
		if (!participant || participant.groupId !== groupId) {
			return [];
		}

		return getLocalData().exclusionPairs
			.flatMap((pair) => {
				const [firstId, secondId] = pair.split(':');
				if (firstId === id) return [secondId];
				if (secondId === id) return [firstId];
				return [];
			})
			.sort();
	}

	setExclusions(id: string, groupId: string, excludedIds: string[]): boolean {
		const uniqueExcludedIds = [...new Set(excludedIds)];
		const data = getLocalData();
		const participant = data.participants.find((currentParticipant) => currentParticipant.id === id);
		const isValid =
			participant?.groupId === groupId &&
			uniqueExcludedIds.every((excludedId) => {
				const excludedParticipant = data.participants.find((currentParticipant) => currentParticipant.id === excludedId);
				return excludedId !== id && excludedParticipant?.groupId === groupId;
			});
		if (!isValid) {
			return false;
		}

		return updateLocalData((draft) => {
			draft.exclusionPairs = draft.exclusionPairs.filter((pair) => !this.#pairIncludesParticipant(pair, id));
			for (const excludedId of uniqueExcludedIds) {
				draft.exclusionPairs.push(this.#pairKey(id, excludedId));
			}
			return true;
		});
	}

	setAccessPinHash(id: string, groupId: string, accessPinHash: string): ParticipantProfile | null {
		if (!accessPinHash) {
			return null;
		}

		return updateLocalData((data) => {
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

export function createLocalParticipant(input: CreateParticipantInput): ParticipantProfile | null {
	return directory.create(input);
}

export function listLocalParticipants(groupId: string): ParticipantProfile[] {
	return directory.listByGroup(groupId);
}

export function findLocalParticipant(id: string): ParticipantProfile | null {
	return directory.findById(id);
}

export function removeLocalParticipant(id: string, groupId: string): boolean {
	return directory.remove(id, groupId);
}

export function updateLocalParticipant(
	id: string,
	groupId: string,
	input: UpdateParticipantInput,
): ParticipantProfile | null {
	return directory.update(id, groupId, input);
}

export function listLocalParticipantExclusions(id: string, groupId: string): string[] {
	return directory.listExcludedIds(id, groupId);
}

export function setLocalParticipantExclusions(id: string, groupId: string, excludedIds: string[]): boolean {
	return directory.setExclusions(id, groupId, excludedIds);
}

export function setLocalParticipantAccessPinHash(
	id: string,
	groupId: string,
	accessPinHash: string,
): ParticipantProfile | null {
	return directory.setAccessPinHash(id, groupId, accessPinHash);
}
