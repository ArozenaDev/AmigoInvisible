import assert from 'node:assert/strict';
import test from 'node:test';

import { generateRaffle } from '../src/lib/domain/raffle.ts';

test('genera una permutación completa que respeta exclusiones', () => {
	const result = generateRaffle({
		exclusions: [
			{ firstParticipantId: 'ana', secondParticipantId: 'beto' },
			{ firstParticipantId: 'carla', secondParticipantId: 'dani' },
		],
		participants: [{ id: 'ana' }, { id: 'beto' }, { id: 'carla' }, { id: 'dani' }],
	}, () => 0);

	assert.equal(result.assignments.length, 4);
	assert.equal(new Set(result.assignments.map((assignment) => assignment.giverId)).size, 4);
	assert.equal(new Set(result.assignments.map((assignment) => assignment.recipientId)).size, 4);
	for (const assignment of result.assignments) {
		assert.notEqual(assignment.giverId, assignment.recipientId);
		assert.notDeepEqual([assignment.giverId, assignment.recipientId].sort(), ['ana', 'beto']);
		assert.notDeepEqual([assignment.giverId, assignment.recipientId].sort(), ['carla', 'dani']);
	}
});

test('evita repeticiones del año anterior cuando existe una alternativa válida', () => {
	const result = generateRaffle({
		exclusions: [],
		participants: [{ id: 'ana' }, { id: 'beto' }, { id: 'carla' }],
		previousAssignments: [
			{ giverId: 'ana', recipientId: 'beto' },
			{ giverId: 'beto', recipientId: 'carla' },
			{ giverId: 'carla', recipientId: 'ana' },
		],
	}, () => 0);

	assert.equal(result.repeatedPreviousAssignments, 0);
});
