import type { APIRoute } from 'astro';

import { listLocalEditions, removeLocalEditableEdition } from '../../../../../../lib/server/edition-directory.ts';
import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const editionId = params.id ?? '';
	const group = findLocalGroup(slug);
	if (!group || group.archivedAt !== null || !listLocalEditions(group.id).some((edition) => edition.id === editionId)) {
		return new Response(null, { status: 404 });
	}

	return removeLocalEditableEdition(editionId)
		? redirectToDraws(redirect, slug, 'deleted=edition')
		: redirectToDraws(redirect, slug, 'error=delete-edition');
};

function redirectToDraws(
	redirect: (location: string, status?: number) => Response,
	slug: string,
	query: string,
): Response {
	return redirect(`/admin/sorteos?family=${encodeURIComponent(slug)}&${query}`, 303);
}
