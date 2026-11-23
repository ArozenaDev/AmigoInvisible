export type ParticipantId = string;

export interface RaffleParticipant {
	id: ParticipantId;
}

export interface Assignment {
	giverId: ParticipantId;
	recipientId: ParticipantId;
}

export interface Exclusion {
	firstParticipantId: ParticipantId;
	secondParticipantId: ParticipantId;
}

export interface RaffleGenerationInput {
	participants: readonly RaffleParticipant[];
	/**
	 * Unordered participant pairs. A pair blocks assignments in both directions.
	 */
	exclusions: readonly Exclusion[];
	/** Directed assignments from the immediately preceding edition. */
	previousAssignments?: readonly Assignment[];
}

export interface RaffleGenerationResult {
	assignments: Assignment[];
	repeatedPreviousAssignments: number;
}

export class RaffleGenerationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RaffleGenerationError';
	}
}

/** Returns the stable representation of a symmetric incompatibility pair. */
export function exclusionKey(firstId: ParticipantId, secondId: ParticipantId): string {
	if (firstId === secondId) {
		throw new RaffleGenerationError('Una exclusión no puede referirse al mismo participante.');
	}

	return JSON.stringify([firstId, secondId].sort());
}

/**
 * Generates a complete valid permutation.
 *
 * Hard constraints (same person and exclusions) always win. Among the valid
 * permutations, it chooses uniformly at random among those with the fewest
 * repeated directed assignments from the immediately preceding edition.
 */
export function generateRaffle(
	input: RaffleGenerationInput,
	randomInt: (upperExclusive: number) => number = secureRandomInt,
): RaffleGenerationResult {
	const participantIds = input.participants.map(({ id }) => id);
	validateParticipantIds(participantIds);

	if (participantIds.length < 2) {
		throw new RaffleGenerationError('Se necesitan al menos dos participantes para generar un sorteo.');
	}

	const participantIdSet = new Set(participantIds);
	const exclusionPairs = new Set(
		input.exclusions.map(({ firstParticipantId, secondParticipantId }) => {
			if (!participantIdSet.has(firstParticipantId) || !participantIdSet.has(secondParticipantId)) {
				throw new RaffleGenerationError('Una exclusión solo puede referirse a participantes de la edición.');
			}

			return exclusionKey(firstParticipantId, secondParticipantId);
		}),
	);
	const previousPairs = new Set(
		(input.previousAssignments ?? []).map(({ giverId, recipientId }) => directedAssignmentKey(giverId, recipientId)),
	);
	const candidatesByGiver = new Map(
		participantIds.map((giverId) => [
			giverId,
			participantIds.filter(
				(recipientId) =>
					recipientId !== giverId && !exclusionPairs.has(exclusionKey(giverId, recipientId)),
			),
		]),
	);

	for (const [giverId, candidates] of candidatesByGiver) {
		if (candidates.length === 0) {
			throw new RaffleGenerationError(`No hay destinatarios válidos para el participante ${giverId}.`);
		}
	}

	// Process the most constrained giver first to reduce unnecessary backtracking.
	const givers = [...participantIds].sort(
		(firstId, secondId) =>
			(candidatesByGiver.get(firstId)?.length ?? 0) - (candidatesByGiver.get(secondId)?.length ?? 0),
	);
	const recipientsInUse = new Set<ParticipantId>();
	const currentAssignments: Assignment[] = [];
	let bestRepeatedCount = Number.POSITIVE_INFINITY;
	let solutionCountAtBestScore = 0;
	let chosenAssignments: Assignment[] | undefined;

	function visit(giverIndex: number, repeatedCount: number): void {
		if (repeatedCount > bestRepeatedCount) {
			return;
		}

		if (giverIndex === givers.length) {
			if (repeatedCount < bestRepeatedCount) {
				bestRepeatedCount = repeatedCount;
				solutionCountAtBestScore = 1;
				chosenAssignments = [...currentAssignments];
				return;
			}

			solutionCountAtBestScore += 1;
			if (randomInt(solutionCountAtBestScore) === 0) {
				chosenAssignments = [...currentAssignments];
			}
			return;
		}

		const giverId = givers[giverIndex];
		const candidates = shuffle(candidatesByGiver.get(giverId) ?? [], randomInt);

		for (const recipientId of candidates) {
			if (recipientsInUse.has(recipientId)) {
				continue;
			}

			recipientsInUse.add(recipientId);
			currentAssignments.push({ giverId, recipientId });
			visit(
				giverIndex + 1,
				repeatedCount + Number(previousPairs.has(directedAssignmentKey(giverId, recipientId))),
			);
			currentAssignments.pop();
			recipientsInUse.delete(recipientId);
		}
	}

	visit(0, 0);

	if (!chosenAssignments) {
		throw new RaffleGenerationError('No existe una asignación que cumpla las restricciones indicadas.');
	}

	return {
		assignments: chosenAssignments.sort((first, second) => first.giverId.localeCompare(second.giverId)),
		repeatedPreviousAssignments: bestRepeatedCount,
	};
}

function validateParticipantIds(participantIds: readonly ParticipantId[]): void {
	if (new Set(participantIds).size !== participantIds.length) {
		throw new RaffleGenerationError('Cada participante debe tener un identificador único.');
	}

	if (participantIds.some((id) => id.trim().length === 0)) {
		throw new RaffleGenerationError('El identificador de participante no puede estar vacío.');
	}
}

function directedAssignmentKey(giverId: ParticipantId, recipientId: ParticipantId): string {
	return JSON.stringify([giverId, recipientId]);
}

function secureRandomInt(upperExclusive: number): number {
	if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1) {
		throw new RaffleGenerationError('El límite de aleatoriedad debe ser un entero positivo.');
	}

	const maximumUnbiasedValue = Math.floor(0x1_0000_0000 / upperExclusive) * upperExclusive;
	const values = new Uint32Array(1);

	do {
		crypto.getRandomValues(values);
	} while (values[0] >= maximumUnbiasedValue);

	return values[0] % upperExclusive;
}

function shuffle<T>(items: readonly T[], randomInt: (upperExclusive: number) => number): T[] {
	const result = [...items];

	for (let index = result.length - 1; index > 0; index -= 1) {
		const nextIndex = randomInt(index + 1);
		[result[index], result[nextIndex]] = [result[nextIndex], result[index]];
	}

	return result;
}
