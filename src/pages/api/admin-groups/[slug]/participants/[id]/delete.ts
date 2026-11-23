import type { APIRoute } from 'astro';

import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { removeLocalParticipant } from '../../../../../../lib/server/participant-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const group = findLocalGroup(slug);
	if (!group || group.archivedAt !== null) {
		return new Response(null, { status: 404 });
	}

	return removeLocalParticipant(params.id ?? '', group.id)
		? redirect(`/admin/participantes?family=${encodeURIComponent(slug)}&deleted=participant`, 303)
		: redirect(`/admin/participantes?family=${encodeURIComponent(slug)}&error=delete`, 303);
};
