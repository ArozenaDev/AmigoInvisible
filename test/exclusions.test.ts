import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalTestContext } from './helpers.ts';

const context = await createLocalTestContext('amigo-exclusions');

test.after(() => context.cleanup());

function assertNoExcludedAssignment(
	assignments: readonly { giverId: string; recipientId: string }[],
	firstParticipantId: string,
	secondParticipantId: string,
): void {
	for (const assignment of assignments) {
		assert.notDeepEqual(
			[assignment.giverId, assignment.recipientId].sort(),
			[firstParticipantId, secondParticipantId].sort(),
			'Una asignación no puede unir dos participantes incompatibles.',
		);
	}
}

test('aplica las incompatibilidades globales de perfiles al crear y generar una edición', async () => {
	context.seed('group-profiles', [
		{ displayName: 'Ana', id: 'ana' },
		{ displayName: 'Beto', id: 'beto' },
		{ displayName: 'Carla', id: 'carla' },
		{ displayName: 'Dani', id: 'dani' },
	]);
	assert.equal(await context.participants.setLocalParticipantExclusions('ana', 'group-profiles', ['beto']), true);

	const edition = await context.editions.createLocalEdition('group-profiles', 2026);
	assert.ok(edition);
	assert.equal(edition.exclusions.length, 1);
	assert.equal((await context.editions.generateLocalEdition(edition.id)).ok, true);

	const generated = await context.editions.findLocalEdition(edition.id);
	assert.ok(generated);
	const participantIdByProfileId = new Map(generated.participants.map((participant) => [participant.profileId, participant.id]));
	assertNoExcludedAssignment(
		generated.assignments,
		participantIdByProfileId.get('ana') ?? '',
		participantIdByProfileId.get('beto') ?? '',
	);
});

test('aplica las incompatibilidades configuradas solo para una edición al generar el sorteo', async () => {
	context.seed('group-edition', [
		{ displayName: 'Elena', id: 'elena' },
		{ displayName: 'Fabián', id: 'fabian' },
		{ displayName: 'Gloria', id: 'gloria' },
		{ displayName: 'Hugo', id: 'hugo' },
	]);
	const edition = await context.editions.createLocalEdition('group-edition', 2026);
	assert.ok(edition);
	const [first, second] = edition.participants;
	assert.ok(first && second);
	assert.ok(await context.editions.setLocalEditionExclusions(edition.id, [{
		firstParticipantId: first.id,
		secondParticipantId: second.id,
	}]));
	assert.equal((await context.editions.generateLocalEdition(edition.id)).ok, true);

	const generated = await context.editions.findLocalEdition(edition.id);
	assert.ok(generated);
	assertNoExcludedAssignment(generated.assignments, first.id, second.id);
	assert.equal((await context.participants.listLocalParticipantExclusions('elena', 'group-edition')).length, 0);
});
