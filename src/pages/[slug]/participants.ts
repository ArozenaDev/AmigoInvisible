import type { APIRoute } from 'astro';

import { findLocalEdition, searchLocalEditionParticipants } from '../../lib/server/edition-directory.ts';
import { findAvailableLocalGroup } from '../../lib/server/group-directory.ts';
import { getGroupSession, GROUP_SESSION_COOKIE } from '../../lib/server/sessions.ts';

export const GET: APIRoute = ({ params, request, cookies }) => {
	const slug = params.slug ?? '';
	const group = findAvailableLocalGroup(slug);
	const session = group ? getGroupSession(cookies.get(GROUP_SESSION_COOKIE)?.value, group.id) : null;
	const activeEdition = group?.activeEditionId ? findLocalEdition(group.activeEditionId) : null;
	if (!group || !session || !activeEdition || activeEdition.groupId !== group.id || activeEdition.status !== 'active') {
		return json({ participants: [] }, 403);
	}

	const query = new URL(request.url).searchParams.get('q') ?? '';
	return json({ participants: searchLocalEditionParticipants(activeEdition.id, query) });
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
