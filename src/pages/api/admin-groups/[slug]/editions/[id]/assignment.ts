import type { APIRoute } from 'astro';

import { findLocalEdition, listLocalEditions } from '../../../../../../lib/server/edition-directory.ts';
import { participantVisibleName } from '../../../../../../lib/domain/participant.ts';
import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const GET: APIRoute = async ({ params, request, cookies }) => {
	if (!await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return json({ message: 'No ha sido posible consultar la asignación.' }, 403);
	}

	const slug = params.slug ?? '';
	const editionId = params.id ?? '';
	const participantId = new URL(request.url).searchParams.get('participantId') ?? '';
	const group = await findLocalGroup(slug);
	if (!group || !(await listLocalEditions(group.id)).some((edition) => edition.id === editionId)) {
		return json({ message: 'No ha sido posible consultar la asignación.' }, 404);
	}

	const edition = await findLocalEdition(editionId);
	const assignment = edition?.assignments.find((currentAssignment) => currentAssignment.giverId === participantId);
	const recipient = assignment ? edition?.participants.find((participant) => participant.id === assignment.recipientId) : null;
	return recipient
		? json({ recipientName: participantVisibleName(recipient) })
		: json({ message: 'No ha sido posible consultar la asignación.' }, 404);
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
	});
}
