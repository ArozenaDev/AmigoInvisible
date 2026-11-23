import type { APIRoute } from 'astro';

import { closeLocalEdition, listLocalEditions } from '../../../../../../lib/server/edition-directory.ts';
import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) return new Response(null, { status: 403 });
	const slug = params.slug ?? '';
	const group = await findLocalGroup(slug);
	const editionId = params.id ?? '';
	if (!group || group.archivedAt !== null || !(await listLocalEditions(group.id)).some((edition) => edition.id === editionId)) return new Response(null, { status: 404 });
	return await closeLocalEdition(editionId)
		? redirect(`/admin/sorteos?family=${encodeURIComponent(slug)}&closed=edition`, 303)
		: redirect(`/admin/sorteos?family=${encodeURIComponent(slug)}&error=close`, 303);
};
