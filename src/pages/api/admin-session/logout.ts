import type { APIRoute } from 'astro';

import { hasSameOrigin } from '../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, revokeSession } from '../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	if (!hasSameOrigin(request)) {
		return new Response(null, { status: 403 });
	}

	await revokeSession(cookies.get(ADMIN_SESSION_COOKIE)?.value);
	cookies.delete(ADMIN_SESSION_COOKIE, { path: '/' });
	return redirect('/admin', 303);
};
