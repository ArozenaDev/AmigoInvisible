import type { APIRoute } from 'astro';

import { activateLocalEdition, listLocalEditions } from '../../../../../../lib/server/edition-directory.ts';
import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const editionId = params.id ?? '';
	const group = await findLocalGroup(slug);
	if (!group || group.archivedAt !== null || !(await listLocalEditions(group.id)).some((edition) => edition.id === editionId)) {
		return new Response(null, { status: 404 });
	}

	return await activateLocalEdition(editionId)
		? redirectToDraws(redirect, slug, 'activated=edition')
		: redirectToDraws(redirect, slug, 'error=activate');
};

function redirectToDraws(
	redirect: (location: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response,
	slug: string,
	query: string,
): Response {
	return redirect(`/admin/sorteos?family=${encodeURIComponent(slug)}&${query}`, 303);
}
