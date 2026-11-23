import type { APIRoute } from 'astro';
import { randomInt } from 'node:crypto';

import { getServerSecrets } from '../../../../../../lib/server/env.ts';
import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { hashParticipantPin } from '../../../../../../lib/server/passwords.ts';
import { setLocalParticipantAccessPinHash } from '../../../../../../lib/server/participant-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return json({ message: 'No ha sido posible generar el PIN.' }, 403);
	}

	const slug = params.slug ?? '';
	const group = await findLocalGroup(slug);
	if (!group || group.archivedAt !== null) {
		return json({ message: 'No ha sido posible generar el PIN.' }, 404);
	}

	const pin = randomInt(0, 10_000).toString().padStart(4, '0');
	const { sessionSecret } = getServerSecrets();
	const participant = await setLocalParticipantAccessPinHash(params.id ?? '', group.id, hashParticipantPin(pin, sessionSecret));
	return participant
		? json({ pin })
		: json({ message: 'No ha sido posible generar el PIN.' }, 404);
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
	});
}
