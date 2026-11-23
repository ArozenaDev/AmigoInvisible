import { randomUUID } from 'node:crypto';

import {
	assertEditionDocument,
	type EditionDocument,
	type EditionExclusion,
	type EditionParticipant,
	type ParticipantGiftSnapshot,
} from '../domain/edition.ts';
import { generateRaffle, type Assignment } from '../domain/raffle.ts';
import type { GiftIdea } from '../domain/gift-idea.ts';
import { participantVisibleName } from '../domain/participant.ts';
import { getLocalData, updateLocalData } from './local-json-store.ts';

export type GenerateEditionResult =
	| { edition: EditionDocument; ok: true; repeatedPreviousAssignments: number }
	| { ok: false };

export interface PublicParticipantSuggestion {
	id: string;
	visibleName: string;
}

export type LocalRevealResult =
	| { kind: 'revealed'; recipientName: string; ideas: Pick<GiftIdea, 'affiliateUrl' | 'imageUrl' | 'title'>[] }
	| { kind: 'unavailable' };

export function createLocalEdition(groupId: string, year: number): EditionDocument | null {
	if (!Number.isInteger(year) || year < 2000 || year > 9999) return null;
	return updateLocalData((data) => {
		if (!data.groups.some((group) => group.id === groupId) || data.editions.some((edition) => edition.groupId === groupId && edition.year === year)) return null;
		const participants = participantsFromCurrentProfiles(data.participants, groupId);
		const edition: EditionDocument = {
			activatedAt: null,
			assignments: [],
			auditEvents: [],
			closedAt: null,
			createdAt: new Date().toISOString(),
			exclusions: copyProfileExclusions(data.exclusionPairs, participants),
			giftIdeasSnapshot: [],
			groupId,
			id: randomUUID(),
			participants,
			revealEvents: [],
			revealStates: createRevealStates(participants),
			schemaVersion: 2,
			status: 'inactive',
			year,
		};
		assertEditionDocument(edition);
		data.editions.push(edition);
		return edition;
	});
}

export function listLocalEditions(groupId: string): EditionDocument[] {
	return getLocalData().editions.filter((edition) => edition.groupId === groupId).sort((first, second) => second.year - first.year);
}

export function findLocalEdition(editionId: string): EditionDocument | null {
	return getLocalData().editions.find((edition) => edition.id === editionId) ?? null;
}

export function searchLocalEditionParticipants(editionId: string, query: string): PublicParticipantSuggestion[] {
	const normalizedQuery = normalizeSearchText(query);
	const edition = findLocalEdition(editionId);
	if (!edition || edition.status !== 'active' || normalizedQuery.length < 2) return [];
	return edition.participants
		.filter((participant) => normalizeSearchText(participantVisibleName(participant)).includes(normalizedQuery))
		.slice(0, 8)
		.map((participant) => ({ id: participant.id, visibleName: participantVisibleName(participant) }));
}

/** Returns a result on every valid PIN-verified visit while the edition is active. */
export function revealLocalEditionParticipant(editionId: string, participantId: string): LocalRevealResult {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		if (!edition || edition.status !== 'active') return { kind: 'unavailable' };
		const revealState = edition.revealStates.find((state) => state.participantId === participantId);
		const assignment = edition.assignments.find((currentAssignment) => currentAssignment.giverId === participantId);
		if (!revealState || !assignment) return { kind: 'unavailable' };
		const recipient = edition.participants.find((participant) => participant.id === assignment.recipientId);
		if (!recipient) return { kind: 'unavailable' };

		const now = new Date().toISOString();
		revealState.revealCount += 1;
		revealState.lastRevealedAt = now;
		edition.revealEvents.push({ occurredAt: now, participantId, type: 'revealed' });
		assertEditionDocument(edition);
		return {
			ideas: data.giftIdeas.filter((idea) => idea.participantId === recipient.profileId).sort((first, second) => first.sortOrder - second.sortOrder).map(({ affiliateUrl, imageUrl, title }) => ({ affiliateUrl, imageUrl, title })),
			kind: 'revealed',
			recipientName: participantVisibleName(recipient),
		};
	});
}

/** An inactive edition may be deleted only before anyone has viewed a result. */
export function removeLocalEditableEdition(editionId: string): boolean {
	return updateLocalData((data) => {
		const editionIndex = data.editions.findIndex((edition) => edition.id === editionId);
		const edition = data.editions[editionIndex];
		if (!edition || edition.status !== 'inactive' || edition.revealStates.some((state) => state.revealCount > 0)) return false;
		data.editions.splice(editionIndex, 1);
		return true;
	});
}

export function activateLocalEdition(editionId: string): EditionDocument | null {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		const group = edition ? data.groups.find((currentGroup) => currentGroup.id === edition.groupId) : undefined;
		if (!edition || !group || edition.status !== 'inactive' || edition.assignments.length !== edition.participants.length || group.activeEditionId !== null) return null;
		const now = new Date().toISOString();
		if (edition.giftIdeasSnapshot.length === 0) edition.giftIdeasSnapshot = edition.participants.map((participant) => snapshotGiftIdeas(participant, data.giftIdeas));
		edition.activatedAt = now;
		edition.status = 'active';
		edition.auditEvents.push({ actor: 'admin', occurredAt: now, type: 'activated' });
		group.activeEditionId = edition.id;
		group.updatedAt = now;
		assertEditionDocument(edition);
		return edition;
	});
}

export function deactivateLocalEdition(editionId: string): EditionDocument | null {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		const group = edition ? data.groups.find((currentGroup) => currentGroup.id === edition.groupId) : undefined;
		if (!edition || !group || edition.status !== 'active' || group.activeEditionId !== edition.id) return null;
		const now = new Date().toISOString();
		edition.status = 'inactive';
		edition.auditEvents.push({ actor: 'admin', occurredAt: now, type: 'deactivated' });
		group.activeEditionId = null;
		group.updatedAt = now;
		assertEditionDocument(edition);
		return edition;
	});
}

export function closeLocalEdition(editionId: string): EditionDocument | null {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		const group = edition ? data.groups.find((currentGroup) => currentGroup.id === edition.groupId) : undefined;
		if (!edition || !group || edition.status !== 'active' || group.activeEditionId !== edition.id) return null;
		const now = new Date().toISOString();
		edition.closedAt = now;
		edition.status = 'closed';
		edition.auditEvents.push({ actor: 'admin', occurredAt: now, type: 'closed' });
		group.activeEditionId = null;
		group.updatedAt = now;
		assertEditionDocument(edition);
		return edition;
	});
}

/** Reopens a closed edition after an administrative mistake without changing its draw. */
export function reactivateLocalEdition(editionId: string): EditionDocument | null {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		const group = edition ? data.groups.find((currentGroup) => currentGroup.id === edition.groupId) : undefined;
		if (
			!edition ||
			!group ||
			edition.status !== 'closed' ||
			group.activeEditionId !== null ||
			edition.assignments.length !== edition.participants.length
		) {
			return null;
		}

		const now = new Date().toISOString();
		edition.status = 'active';
		edition.auditEvents.push({ actor: 'admin', occurredAt: now, type: 'reactivated' });
		group.activeEditionId = edition.id;
		group.updatedAt = now;
		assertEditionDocument(edition);
		return edition;
	});
}

/** Refreshes an inactive edition from reusable profiles and invalidates its draw. */
export function synchronizeLocalEditionParticipants(editionId: string): EditionDocument | null {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		if (!edition || edition.status !== 'inactive') return null;
		applyProfiles(edition, data.participants.filter((profile) => profile.groupId === edition.groupId), data.exclusionPairs);
		edition.auditEvents.push({ actor: 'admin', occurredAt: new Date().toISOString(), type: 'participants-synced' });
		assertEditionDocument(edition);
		return edition;
	});
}

/** Applies chosen reusable profiles only while the edition is inactive. */
export function setLocalEditionParticipants(editionId: string, profileIds: string[]): EditionDocument | null {
	const uniqueProfileIds = [...new Set(profileIds)];
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		if (!edition || edition.status !== 'inactive') return null;
		const profiles = data.participants.filter((profile) => profile.groupId === edition.groupId && uniqueProfileIds.includes(profile.id));
		if (profiles.length !== uniqueProfileIds.length) return null;
		applyProfiles(edition, profiles, data.exclusionPairs);
		edition.auditEvents.push({ actor: 'admin', occurredAt: new Date().toISOString(), type: 'participants-synced' });
		assertEditionDocument(edition);
		return edition;
	});
}

/** Stores the restrictions owned by one inactive edition and invalidates its draw. */
export function setLocalEditionExclusions(editionId: string, exclusions: readonly EditionExclusion[]): EditionDocument | null {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		if (!edition || edition.status !== 'inactive') return null;
		const participantIds = new Set(edition.participants.map((participant) => participant.id));
		const uniqueExclusions = new Map<string, EditionExclusion>();
		for (const exclusion of exclusions) {
			if (exclusion.firstParticipantId === exclusion.secondParticipantId || !participantIds.has(exclusion.firstParticipantId) || !participantIds.has(exclusion.secondParticipantId)) return null;
			const [firstParticipantId, secondParticipantId] = [exclusion.firstParticipantId, exclusion.secondParticipantId].sort();
			uniqueExclusions.set(JSON.stringify([firstParticipantId, secondParticipantId]), { firstParticipantId, secondParticipantId });
		}
		edition.assignments = [];
		edition.exclusions = [...uniqueExclusions.values()];
		edition.auditEvents.push({ actor: 'admin', occurredAt: new Date().toISOString(), type: 'exclusions-updated' });
		assertEditionDocument(edition);
		return edition;
	});
}

export function generateLocalEdition(editionId: string): GenerateEditionResult {
	return updateLocalData((data) => {
		const edition = data.editions.find((currentEdition) => currentEdition.id === editionId);
		if (!edition || edition.status !== 'inactive') return { ok: false };
		try {
			const result = generateRaffle({ exclusions: edition.exclusions, participants: edition.participants, previousAssignments: previousAssignmentsFor(edition, data.editions) });
			edition.assignments = result.assignments;
			edition.auditEvents.push({ actor: 'admin', occurredAt: new Date().toISOString(), type: 'generated' });
			assertEditionDocument(edition);
			return { edition, ok: true, repeatedPreviousAssignments: result.repeatedPreviousAssignments };
		} catch {
			return { ok: false };
		}
	});
}

function applyProfiles(edition: EditionDocument, profiles: readonly { alias: string | null; displayName: string; groupId: string; id: string }[], profilePairs: readonly string[]): void {
	const previousProfileIdByParticipantId = new Map(
		edition.participants.map((participant) => [participant.id, participant.profileId]),
	);
	const participants = participantsFromCurrentProfiles(profiles, edition.groupId);
	const participantIdByProfileId = new Map(participants.map((participant) => [participant.profileId, participant.id]));
	const retainedEditionExclusions = edition.exclusions.flatMap((exclusion) => {
		const firstProfileId = previousProfileIdByParticipantId.get(exclusion.firstParticipantId);
		const secondProfileId = previousProfileIdByParticipantId.get(exclusion.secondParticipantId);
		const firstParticipantId = firstProfileId ? participantIdByProfileId.get(firstProfileId) : undefined;
		const secondParticipantId = secondProfileId ? participantIdByProfileId.get(secondProfileId) : undefined;
		return firstParticipantId && secondParticipantId
			? [{ firstParticipantId, secondParticipantId }]
			: [];
	});
	edition.assignments = [];
	// Keep restrictions explicitly configured for this edition whenever both
	// profiles remain, while adding defaults belonging to newly synced profiles.
	edition.exclusions = mergeEditionExclusions([
		...copyProfileExclusions(profilePairs, participants),
		...retainedEditionExclusions,
	]);
	// Participant IDs are edition snapshots. Replacing the membership gives each
	// profile a new edition ID, so the prior gift snapshot cannot remain valid.
	edition.giftIdeasSnapshot = [];
	edition.participants = participants;
	edition.revealEvents = [];
	edition.revealStates = createRevealStates(participants);
}

function mergeEditionExclusions(exclusions: readonly EditionExclusion[]): EditionExclusion[] {
	const uniqueExclusions = new Map<string, EditionExclusion>();
	for (const exclusion of exclusions) {
		const [firstParticipantId, secondParticipantId] = [
			exclusion.firstParticipantId,
			exclusion.secondParticipantId,
		].sort();
		uniqueExclusions.set(JSON.stringify([firstParticipantId, secondParticipantId]), { firstParticipantId, secondParticipantId });
	}
	return [...uniqueExclusions.values()];
}

function createRevealStates(participants: readonly EditionParticipant[]) {
	return participants.map((participant) => ({ lastRevealedAt: null, participantId: participant.id, revealCount: 0 }));
}

function findPreviousEdition(editions: readonly EditionDocument[], groupId: string, year: number): EditionDocument | null {
	return editions.filter((edition) => edition.groupId === groupId && edition.year < year).sort((first, second) => second.year - first.year)[0] ?? null;
}

function participantsFromCurrentProfiles(profiles: readonly { alias: string | null; displayName: string; groupId: string; id: string }[], groupId: string): EditionParticipant[] {
	return profiles.filter((participant) => participant.groupId === groupId).map((participant) => ({ alias: participant.alias, displayName: participant.displayName, id: randomUUID(), profileId: participant.id }));
}

function copyProfileExclusions(profilePairs: readonly string[], participants: readonly EditionParticipant[]): EditionExclusion[] {
	const participantIdByProfileId = new Map(participants.map((participant) => [participant.profileId, participant.id]));
	return profilePairs.flatMap((pair) => {
		const [firstProfileId, secondProfileId] = pair.split(':');
		const firstParticipantId = participantIdByProfileId.get(firstProfileId);
		const secondParticipantId = participantIdByProfileId.get(secondProfileId);
		return firstParticipantId && secondParticipantId ? [{ firstParticipantId, secondParticipantId }] : [];
	});
}

function previousAssignmentsFor(edition: EditionDocument, editions: readonly EditionDocument[]): Assignment[] {
	const previousEdition = findPreviousEdition(editions, edition.groupId, edition.year);
	if (!previousEdition) return [];
	const previousProfileIdByParticipantId = new Map(previousEdition.participants.map((participant) => [participant.id, participant.profileId]));
	const participantIdByProfileId = new Map(edition.participants.map((participant) => [participant.profileId, participant.id]));
	return previousEdition.assignments.flatMap((assignment) => {
		const giverProfileId = previousProfileIdByParticipantId.get(assignment.giverId);
		const recipientProfileId = previousProfileIdByParticipantId.get(assignment.recipientId);
		const giverId = giverProfileId ? participantIdByProfileId.get(giverProfileId) : undefined;
		const recipientId = recipientProfileId ? participantIdByProfileId.get(recipientProfileId) : undefined;
		return giverId && recipientId ? [{ giverId, recipientId }] : [];
	});
}

function snapshotGiftIdeas(participant: EditionParticipant, giftIdeas: readonly GiftIdea[]): ParticipantGiftSnapshot {
	return { ideas: giftIdeas.filter((idea) => idea.participantId === participant.profileId).sort((first, second) => first.sortOrder - second.sortOrder).map((idea) => ({ affiliateUrl: idea.affiliateUrl, imageUrl: idea.imageUrl, id: randomUUID(), originalGiftIdeaId: idea.id, sortOrder: idea.sortOrder, title: idea.title })), participantId: participant.id };
}

function normalizeSearchText(value: string): string {
	return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('es');
}
