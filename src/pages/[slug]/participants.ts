import type { APIRoute } from 'astro';

import { findLocalEdition, searchLocalEditionParticipants } from '../../lib/server/edition-directory.ts';
import { findAvailableLocalGroup } from '../../lib/server/group-directory.ts';
import { getGroupSession, GROUP_SESSION_COOKIE } from '../../lib/server/sessions.ts';

export const GET: APIRoute = async ({ params, request, cookies }) => {
	const slug = params.slug ?? '';
	const group = await findAvailableLocalGroup(slug);
	const session = group ? await getGroupSession(cookies.get(GROUP_SESSION_COOKIE)?.value, group.id) : null;
	const activeEdition = group?.activeEditionId ? await findLocalEdition(group.activeEditionId) : null;
	if (!group || !session || !activeEdition || activeEdition.groupId !== group.id || activeEdition.status !== 'active') {
		return json({ participants: [] }, 403);
	}

	const query = new URL(request.url).searchParams.get('q') ?? '';
	return json({ participants: await searchLocalEditionParticipants(activeEdition.id, query) });
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
