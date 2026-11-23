import { randomUUID } from 'node:crypto';

import {
	normalizeGiftIdeaInput,
	type GiftIdea,
	type GiftIdeaInput,
} from '../domain/gift-idea.ts';
import { getLocalData, updateLocalData } from './local-json-store.ts';

export function createLocalGiftIdea(
	groupId: string,
	participantId: string,
	input: GiftIdeaInput,
): GiftIdea | null {
	const normalized = normalizeGiftIdeaInput(input);
	if (!normalized || !participantBelongsToGroup(participantId, groupId)) {
		return null;
	}

	const now = new Date().toISOString();
	const sortOrder = Math.max(
		-1,
		...getLocalData().giftIdeas
			.filter((idea) => idea.participantId === participantId)
			.map((idea) => idea.sortOrder),
	) + 1;
	const idea: GiftIdea = {
		...normalized,
		createdAt: now,
		groupId,
		id: randomUUID(),
		participantId,
		sortOrder,
		updatedAt: now,
	};

	updateLocalData((data) => {
		data.giftIdeas.push(idea);
	});
	return idea;
}

export function listLocalGiftIdeas(groupId: string, participantId: string): GiftIdea[] {
	return getLocalData().giftIdeas
		.filter((idea) => idea.groupId === groupId && idea.participantId === participantId)
		.sort((first, second) => first.sortOrder - second.sortOrder || first.createdAt.localeCompare(second.createdAt));
}

export function updateLocalGiftIdea(
	groupId: string,
	participantId: string,
	ideaId: string,
	input: GiftIdeaInput,
): GiftIdea | null {
	const normalized = normalizeGiftIdeaInput(input);
	if (!normalized || !participantBelongsToGroup(participantId, groupId)) {
		return null;
	}

	return updateLocalData((data) => {
		const idea = data.giftIdeas.find(
			(currentIdea) =>
				currentIdea.id === ideaId &&
				currentIdea.groupId === groupId &&
				currentIdea.participantId === participantId,
		);
		if (!idea) {
			return null;
		}

		idea.affiliateUrl = normalized.affiliateUrl;
		idea.imageUrl = normalized.imageUrl;
		idea.title = normalized.title;
		idea.updatedAt = new Date().toISOString();
		return idea;
	});
}

export function removeLocalGiftIdea(groupId: string, participantId: string, ideaId: string): boolean {
	if (!participantBelongsToGroup(participantId, groupId)) {
		return false;
	}

	return updateLocalData((data) => {
		const exists = data.giftIdeas.some(
			(idea) => idea.id === ideaId && idea.groupId === groupId && idea.participantId === participantId,
		);
		if (!exists) {
			return false;
		}

		data.giftIdeas = data.giftIdeas.filter((idea) => idea.id !== ideaId);
		return true;
	});
}

function participantBelongsToGroup(participantId: string, groupId: string): boolean {
	return getLocalData().participants.some(
		(participant) => participant.id === participantId && participant.groupId === groupId,
	);
}
