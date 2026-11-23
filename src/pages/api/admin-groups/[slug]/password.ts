import type { APIRoute } from 'astro';

import { findLocalGroup, updateLocalGroupAccessPasswordHash } from '../../../../lib/server/group-directory.ts';
import { hashPassword } from '../../../../lib/server/passwords.ts';
import { hasSameOrigin } from '../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	if (!await findLocalGroup(slug)) {
		return new Response(null, { status: 404 });
	}

	const password = (await request.formData()).get('password');
	if (typeof password !== 'string' || password.length < 6) {
		return redirectToSettings(redirect, slug, 'error=password');
	}

	return await updateLocalGroupAccessPasswordHash(slug, hashPassword(password))
		? redirectToSettings(redirect, slug, 'updated=password')
		: redirectToSettings(redirect, slug, 'error=password');
};

function redirectToSettings(
	redirect: (location: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response,
	slug: string,
	query: string,
): Response {
	return redirect(`/admin/familias/${encodeURIComponent(slug)}?${query}`, 303);
}
