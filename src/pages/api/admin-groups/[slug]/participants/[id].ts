import type { APIRoute } from 'astro';

import { findLocalGroup } from '../../../../../lib/server/group-directory.ts';
import { updateLocalParticipant } from '../../../../../lib/server/participant-directory.ts';
import { hasSameOrigin } from '../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const participantId = params.id ?? '';
	const group = findLocalGroup(slug);
	if (!group || group.archivedAt !== null) {
		return new Response(null, { status: 404 });
	}

	const formData = await request.formData();
	const displayName = formData.get('displayName');
	const alias = formData.get('alias');
	if (typeof displayName !== 'string' || (typeof alias !== 'string' && alias !== null)) {
		return redirect(`/admin/participantes/${participantId}?family=${encodeURIComponent(slug)}&error=validation`, 303);
	}

	const participant = updateLocalParticipant(participantId, group.id, {
		alias: typeof alias === 'string' && alias.trim().length > 0 ? alias : null,
		displayName,
	});

	return participant === null
		? redirect(`/admin/participantes/${participantId}?family=${encodeURIComponent(slug)}&error=validation`, 303)
		: redirect(`/admin/participantes/${participantId}?family=${encodeURIComponent(slug)}&updated=profile`, 303);
};
