import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';

import { findLocalEdition, revealLocalEditionParticipant } from '../../lib/server/edition-directory.ts';
import { getServerSecrets } from '../../lib/server/env.ts';
import { findAvailableLocalGroup } from '../../lib/server/group-directory.ts';
import { hashParticipantPin, verifyParticipantPin } from '../../lib/server/passwords.ts';
import { findLocalParticipant } from '../../lib/server/participant-directory.ts';
import {
	canAttemptParticipantPin,
	clearParticipantPinFailures,
	hasSameOrigin,
	recordFailedParticipantPin,
	requestIdentifier,
} from '../../lib/server/request-security.ts';
import { getGroupSession, GROUP_SESSION_COOKIE } from '../../lib/server/sessions.ts';

const unknownPinHash = hashParticipantPin('0000', randomBytes(32).toString('base64url'));

export const POST: APIRoute = async ({ params, request, cookies }) => {
	if (!hasSameOrigin(request)) {
		return json({ message: 'No ha sido posible revelar el resultado.' }, 403);
	}

	const slug = params.slug ?? '';
	const group = await findAvailableLocalGroup(slug);
	const session = group ? await getGroupSession(cookies.get(GROUP_SESSION_COOKIE)?.value, group.id) : null;
	const activeEdition = group?.activeEditionId ? await findLocalEdition(group.activeEditionId) : null;
	if (!group || !session || !activeEdition || activeEdition.groupId !== group.id || activeEdition.status !== 'active') {
		return json({ message: 'No ha sido posible revelar el resultado.' }, 403);
	}

	const formData = await request.formData();
	const participantId = formData.get('participantId');
	const pin = formData.get('pin');
	if (typeof participantId !== 'string' || typeof pin !== 'string') {
		return json({ message: 'No ha sido posible revelar el resultado.' }, 400);
	}
	const editionParticipant = activeEdition.participants.find((participant) => participant.id === participantId);
	if (!editionParticipant) return json({ message: 'No ha sido posible revelar el resultado.' }, 403);
	const pinAttemptId = `pin:${group.id}:${participantId}:${requestIdentifier(request)}`;
	if (!await canAttemptParticipantPin(pinAttemptId)) {
		return json({ message: 'No ha sido posible revelar el resultado.' }, 429);
	}

	const participant = await findLocalParticipant(editionParticipant.profileId);
	const { sessionSecret } = getServerSecrets();
	const pinMatches = verifyParticipantPin(pin, participant?.accessPinHash ?? unknownPinHash, sessionSecret);
	if (!pinMatches || participant?.groupId !== group.id) {
		recordFailedParticipantPin(pinAttemptId);
		return json({ message: 'El PIN no es correcto.' }, 403);
	}

	await clearParticipantPinFailures(pinAttemptId);

	const result = await revealLocalEditionParticipant(activeEdition.id, participantId);
	if (result.kind !== 'revealed') {
		return json({ message: 'No ha sido posible revelar el resultado.' }, 409);
	}

	return json({ ideas: result.ideas, recipientName: result.recipientName });
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'cache-control': 'no-store',
			'content-type': 'application/json; charset=utf-8',
		},
	});
}
