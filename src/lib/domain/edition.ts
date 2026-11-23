import { exclusionKey, type Assignment, type ParticipantId } from './raffle.ts';

/** The only lifecycle states exposed by the application. */
export type EditionStatus = 'inactive' | 'active' | 'closed';

export interface EditionParticipant {
	id: ParticipantId;
	profileId: string;
	displayName: string;
	alias: string | null;
}

export interface EditionExclusion {
	firstParticipantId: ParticipantId;
	secondParticipantId: ParticipantId;
}

export interface GiftIdeaSnapshot {
	id: string;
	originalGiftIdeaId: string | null;
	title: string;
	affiliateUrl: string;
	imageUrl: string;
	sortOrder: number;
}

export interface ParticipantGiftSnapshot {
	participantId: ParticipantId;
	ideas: GiftIdeaSnapshot[];
}

export type RevealEvent =
	| { type: 'revealed'; participantId: ParticipantId; occurredAt: string }
	// Preserved only for editions created before the simplified lifecycle.
	| { type: 'reset'; participantId: ParticipantId; occurredAt: string; actor: 'admin'; reason: string };

export interface RevealState {
	participantId: ParticipantId;
	revealCount: number;
	lastRevealedAt: string | null;
}

export type EditionAuditEvent =
	| { type: 'generated'; occurredAt: string; actor: 'admin' }
	| { type: 'exclusions-updated'; occurredAt: string; actor: 'admin' }
	| { type: 'participants-synced'; occurredAt: string; actor: 'admin' }
	| { type: 'activated'; occurredAt: string; actor: 'admin' }
	| { type: 'deactivated'; occurredAt: string; actor: 'admin' }
	| { type: 'reactivated'; occurredAt: string; actor: 'admin' }
	| { type: 'closed'; occurredAt: string; actor: 'admin' };

/**
 * The private, versioned document for an edition. Assignment and view state
 * remain together so a participant result is returned only after its access
 * event is durably stored.
 */
export interface EditionDocument {
	schemaVersion: 2;
	id: string;
	groupId: string;
	year: number;
	status: EditionStatus;
	createdAt: string;
	activatedAt: string | null;
	closedAt: string | null;
	participants: EditionParticipant[];
	exclusions: EditionExclusion[];
	assignments: Assignment[];
	revealStates: RevealState[];
	revealEvents: RevealEvent[];
	giftIdeasSnapshot: ParticipantGiftSnapshot[];
	auditEvents: EditionAuditEvent[];
}

export class EditionInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'EditionInvariantError';
	}
}

/** Validates the invariants that must hold before a document reaches storage. */
export function assertEditionDocument(document: EditionDocument): void {
	if (document.schemaVersion !== 2) throw new EditionInvariantError('La versión del esquema de edición no es compatible.');
	if (!Number.isInteger(document.year) || document.year < 2000 || document.year > 9999) throw new EditionInvariantError('El año de la edición no es válido.');
	if (!['inactive', 'active', 'closed'].includes(document.status)) throw new EditionInvariantError('El estado de la edición no es válido.');

	assertTimestamp(document.createdAt, 'La fecha de creación no es válida.');
	assertOptionalTimestamp(document.activatedAt, 'La fecha de activación no es válida.');
	assertOptionalTimestamp(document.closedAt, 'La fecha de cierre no es válida.');
	if ((document.status === 'active' || document.status === 'closed') && document.activatedAt === null) throw new EditionInvariantError('Una edición activa o cerrada requiere fecha de activación.');
	if (document.status === 'closed' && document.closedAt === null) throw new EditionInvariantError('Una edición cerrada requiere fecha de cierre.');

	const participantIds = document.participants.map(({ id }) => id);
	assertUnique(participantIds, 'Los identificadores de participantes de la edición deben ser únicos.');
	assertUnique(document.participants.map(({ profileId }) => profileId), 'Un perfil solo puede aparecer una vez en una edición.');
	for (const participant of document.participants) if (!participant.displayName.trim()) throw new EditionInvariantError('Cada participante debe tener un nombre visible.');

	const participantIdSet = new Set(participantIds);
	const uniqueExclusions = new Set<string>();
	for (const exclusion of document.exclusions) {
		assertKnownParticipant(exclusion.firstParticipantId, participantIdSet);
		assertKnownParticipant(exclusion.secondParticipantId, participantIdSet);
		const key = exclusionKey(exclusion.firstParticipantId, exclusion.secondParticipantId);
		if (uniqueExclusions.has(key)) throw new EditionInvariantError('Las exclusiones no pueden repetirse.');
		uniqueExclusions.add(key);
	}

	assertRevealStates(document.revealStates, participantIdSet);
	assertGiftSnapshot(document.giftIdeasSnapshot, participantIdSet);
	assertAssignments(document, participantIdSet, uniqueExclusions);
	assertRevealEvents(document.revealEvents, participantIdSet);
}

function assertAssignments(document: EditionDocument, participantIdSet: Set<ParticipantId>, exclusions: Set<string>): void {
	const requiresCompleteAssignment = document.status !== 'inactive' || document.assignments.length > 0;
	if (requiresCompleteAssignment && document.participants.length < 2) throw new EditionInvariantError('Una edición con sorteo requiere al menos dos participantes.');
	if (requiresCompleteAssignment && document.assignments.length !== document.participants.length) throw new EditionInvariantError('Las asignaciones deben estar completas.');

	const givers = new Set<ParticipantId>();
	const recipients = new Set<ParticipantId>();
	for (const assignment of document.assignments) {
		assertKnownParticipant(assignment.giverId, participantIdSet);
		assertKnownParticipant(assignment.recipientId, participantIdSet);
		if (assignment.giverId === assignment.recipientId) throw new EditionInvariantError('Un participante no puede regalarse a sí mismo.');
		if (exclusions.has(exclusionKey(assignment.giverId, assignment.recipientId))) throw new EditionInvariantError('Una asignación no puede infringir una exclusión.');
		if (givers.has(assignment.giverId) || recipients.has(assignment.recipientId)) throw new EditionInvariantError('Cada participante debe regalar y recibir exactamente una vez.');
		givers.add(assignment.giverId);
		recipients.add(assignment.recipientId);
	}
}

function assertRevealStates(revealStates: readonly RevealState[], participantIdSet: Set<ParticipantId>): void {
	if (revealStates.length !== participantIdSet.size) throw new EditionInvariantError('Cada participante debe tener un estado de consulta.');
	const knownStates = new Set<ParticipantId>();
	for (const state of revealStates) {
		assertKnownParticipant(state.participantId, participantIdSet);
		if (knownStates.has(state.participantId)) throw new EditionInvariantError('El estado de consulta de un participante está duplicado.');
		if (!Number.isSafeInteger(state.revealCount) || state.revealCount < 0) throw new EditionInvariantError('El número de consultas no es válido.');
		if (state.revealCount > 0 && state.lastRevealedAt === null) throw new EditionInvariantError('Una consulta requiere su fecha.');
		assertOptionalTimestamp(state.lastRevealedAt, 'La fecha de consulta no es válida.');
		knownStates.add(state.participantId);
	}
}

function assertGiftSnapshot(snapshots: readonly ParticipantGiftSnapshot[], participantIdSet: Set<ParticipantId>): void {
	const knownSnapshots = new Set<ParticipantId>();
	for (const snapshot of snapshots) {
		assertKnownParticipant(snapshot.participantId, participantIdSet);
		if (knownSnapshots.has(snapshot.participantId)) throw new EditionInvariantError('La instantánea de ideas de un participante está duplicada.');
		knownSnapshots.add(snapshot.participantId);
	}
}

function assertRevealEvents(events: readonly RevealEvent[], participantIdSet: Set<ParticipantId>): void {
	for (const event of events) {
		assertKnownParticipant(event.participantId, participantIdSet);
		assertTimestamp(event.occurredAt, 'La fecha del historial de consultas no es válida.');
		if (event.type === 'reset' && !event.reason.trim()) throw new EditionInvariantError('Un restablecimiento requiere un motivo.');
	}
}

function assertKnownParticipant(participantId: ParticipantId, participantIds: Set<ParticipantId>): void {
	if (!participantIds.has(participantId)) throw new EditionInvariantError('La edición contiene una referencia a un participante inexistente.');
}

function assertUnique(values: readonly string[], message: string): void {
	if (new Set(values).size !== values.length || values.some((value) => !value.trim())) throw new EditionInvariantError(message);
}

function assertOptionalTimestamp(value: string | null, message: string): void {
	if (value !== null) assertTimestamp(value, message);
}

function assertTimestamp(value: string, message: string): void {
	if (!Number.isFinite(Date.parse(value))) throw new EditionInvariantError(message);
}
