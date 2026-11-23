import assert from 'node:assert/strict';
import test from 'node:test';

import { hashParticipantPin, verifyParticipantPin } from '../src/lib/server/passwords.ts';

test('el PIN de cuatro dígitos se verifica con el secreto del servidor', () => {
	const hash = hashParticipantPin('4821', 'pepper-de-prueba');
	assert.equal(verifyParticipantPin('4821', hash, 'pepper-de-prueba'), true);
	assert.equal(verifyParticipantPin('4822', hash, 'pepper-de-prueba'), false);
	assert.equal(verifyParticipantPin('4821', hash, 'otro-pepper'), false);
});

test('rechaza PIN con formato diferente de cuatro dígitos', () => {
	assert.throws(() => hashParticipantPin('123', 'pepper-de-prueba'));
	assert.equal(verifyParticipantPin('abcd', 'invalid-hash', 'pepper-de-prueba'), false);
});
