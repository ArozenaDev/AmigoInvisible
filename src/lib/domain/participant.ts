export interface ParticipantProfile {
	accessPinHash: string | null;
	alias: string | null;
	createdAt: string;
	displayName: string;
	groupId: string;
	id: string;
	updatedAt: string;
}

export function participantVisibleName(participant: Pick<ParticipantProfile, 'alias' | 'displayName'>): string {
	return participant.alias ? `${participant.displayName} (${participant.alias})` : participant.displayName;
}

export function isValidParticipantName(value: string): boolean {
	return value.trim().length > 0 && value.trim().length <= 120;
}
