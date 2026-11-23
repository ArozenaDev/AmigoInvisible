import type { APIRoute } from 'astro';

import { hasSameOrigin } from '../../lib/server/request-security.ts';
import { GROUP_SESSION_COOKIE, revokeSession } from '../../lib/server/sessions.ts';

export const POST: APIRoute = ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return new Response(null, { status: 404 });
	}

	revokeSession(cookies.get(GROUP_SESSION_COOKIE)?.value);
	cookies.delete(GROUP_SESSION_COOKIE, { path: `/${slug}` });
	return redirect(`/${slug}?logged-out=1`, 303);
};
