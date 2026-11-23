import type { APIRoute } from 'astro';

import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { setLocalParticipantExclusions } from '../../../../../../lib/server/participant-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

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

	const excludedIds = (await request.formData()).getAll('excludedParticipantIds');
	if (!excludedIds.every((id): id is string => typeof id === 'string')) {
		return redirect(`/admin/participantes/${participantId}?family=${encodeURIComponent(slug)}&error=exclusions`, 303);
	}

	const wasUpdated = setLocalParticipantExclusions(participantId, group.id, excludedIds);
	return wasUpdated
		? redirect(`/admin/participantes/${participantId}?family=${encodeURIComponent(slug)}&updated=exclusions`, 303)
		: redirect(`/admin/participantes/${participantId}?family=${encodeURIComponent(slug)}&error=exclusions`, 303);
};
