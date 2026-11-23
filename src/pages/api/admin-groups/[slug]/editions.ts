import type { APIRoute } from 'astro';

import { createLocalEdition } from '../../../../lib/server/edition-directory.ts';
import { findLocalGroup } from '../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const group = await findLocalGroup(slug);
	if (!group || group.archivedAt !== null) {
		return new Response(null, { status: 404 });
	}

	const yearValue = (await request.formData()).get('year');
	const year = typeof yearValue === 'string' ? Number(yearValue) : Number.NaN;
	if (!Number.isInteger(year) || !await createLocalEdition(group.id, year)) {
		return redirectToDraws(redirect, slug, 'error=edition');
	}

	return redirectToDraws(redirect, slug, 'created=edition');
};

function redirectToDraws(
	redirect: (location: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response,
	slug: string,
	query: string,
): Response {
	return redirect(`/admin/sorteos?family=${encodeURIComponent(slug)}&${query}`, 303);
}
