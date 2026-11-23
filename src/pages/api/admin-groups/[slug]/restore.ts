import type { APIRoute } from 'astro';

import { setLocalGroupArchived } from '../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	await setLocalGroupArchived(params.slug ?? '', false);
	return redirect('/admin/familias', 303);
};
