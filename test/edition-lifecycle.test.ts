import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalTestContext } from './helpers.ts';

const context = await createLocalTestContext('amigo-edition');
context.seed('group', [
	{ displayName: 'Ana', id: 'ana' },
	{ displayName: 'Beto', id: 'beto' },
	{ displayName: 'Carla', id: 'carla' },
	{ displayName: 'Dani', id: 'dani' },
]);

test.after(() => context.cleanup());

test('permite consultar repetidamente mientras está activa y reconfigurar al desactivarla', () => {
	const edition = context.editions.createLocalEdition('group', 2026);
	assert.ok(edition);
	assert.equal(edition.status, 'inactive');
	assert.equal(context.editions.generateLocalEdition(edition.id).ok, true);
	assert.ok(context.editions.activateLocalEdition(edition.id));

	const active = context.editions.findLocalEdition(edition.id);
	assert.ok(active);
	const giverId = active.participants[0].id;
	assert.equal(context.editions.revealLocalEditionParticipant(edition.id, giverId).kind, 'revealed');
	assert.equal(context.editions.revealLocalEditionParticipant(edition.id, giverId).kind, 'revealed');
	assert.equal(context.editions.findLocalEdition(edition.id)?.revealStates[0].revealCount, 2);

	assert.ok(context.editions.deactivateLocalEdition(edition.id));
	const inactive = context.editions.findLocalEdition(edition.id);
	assert.ok(inactive);
	assert.equal(inactive.status, 'inactive');
	assert.ok(context.editions.setLocalEditionExclusions(edition.id, [{
		firstParticipantId: inactive.participants[0].id,
		secondParticipantId: inactive.participants[1].id,
	}]));
	const saved = context.editions.findLocalEdition(edition.id);
	assert.ok(saved);
	assert.equal(saved.assignments.length, 0);
	assert.equal(saved.exclusions.length, 1);
	const savedExclusion = saved.exclusions[0];
	assert.ok(savedExclusion);
	assert.deepEqual(
		[savedExclusion.firstParticipantId, savedExclusion.secondParticipantId].sort(),
		[inactive.participants[0].id, inactive.participants[1].id].sort(),
	);

	const expectedProfilePair = [inactive.participants[0].profileId, inactive.participants[1].profileId].sort();
	assert.ok(context.editions.setLocalEditionParticipants(edition.id, saved.participants.map((participant) => participant.profileId)));
	const afterParticipantSave = context.editions.findLocalEdition(edition.id);
	assert.ok(afterParticipantSave);
	assert.equal(afterParticipantSave.exclusions.length, 1);
	const profileIdByParticipantId = new Map(afterParticipantSave.participants.map((participant) => [participant.id, participant.profileId]));
	const retainedExclusion = afterParticipantSave.exclusions[0];
	assert.ok(retainedExclusion);
	assert.deepEqual(
		[profileIdByParticipantId.get(retainedExclusion.firstParticipantId), profileIdByParticipantId.get(retainedExclusion.secondParticipantId)].sort(),
		expectedProfilePair,
	);

	assert.ok(context.editions.synchronizeLocalEditionParticipants(edition.id));
	assert.equal(context.editions.findLocalEdition(edition.id)?.exclusions.length, 1);
});

test('reactiva una edición cerrada sin alterar sus asignaciones', () => {
	const edition = context.editions.createLocalEdition('group', 2027);
	assert.ok(edition);
	assert.equal(context.editions.generateLocalEdition(edition.id).ok, true);
	assert.ok(context.editions.activateLocalEdition(edition.id));
	assert.ok(context.editions.closeLocalEdition(edition.id));
	const assignmentsBefore = context.editions.findLocalEdition(edition.id)?.assignments;

	assert.ok(context.editions.reactivateLocalEdition(edition.id));
	const reactivated = context.editions.findLocalEdition(edition.id);
	assert.ok(reactivated);
	assert.equal(reactivated.status, 'active');
	assert.deepEqual(reactivated.assignments, assignmentsBefore);
	assert.ok(reactivated.auditEvents.some((event) => event.type === 'reactivated'));
});

test('impide eliminar un perfil incluido en una edición', () => {
	context.seed('group-delete', [
		{ displayName: 'Eva', id: 'eva' },
		{ displayName: 'Fabián', id: 'fabian' },
		{ displayName: 'Gloria', id: 'gloria' },
	]);
	const edition = context.editions.createLocalEdition('group-delete', 2028);
	assert.ok(edition);
	assert.equal(context.participants.removeLocalParticipant('eva', 'group-delete'), false);
	assert.ok(context.editions.setLocalEditionParticipants(edition.id, ['fabian', 'gloria']));
	assert.equal(context.participants.removeLocalParticipant('eva', 'group-delete'), true);
});
