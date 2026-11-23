import type { APIRoute } from 'astro';

import { listLocalEditions, setLocalEditionParticipants } from '../../../../../../lib/server/edition-directory.ts';
import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const editionId = params.id ?? '';
	const group = findLocalGroup(slug);
	if (!group || group.archivedAt !== null || !listLocalEditions(group.id).some((edition) => edition.id === editionId)) {
		return new Response(null, { status: 404 });
	}

	const profileIds = (await request.formData()).getAll('profileIds');
	const destination = `/admin/sorteos/${editionId}?family=${encodeURIComponent(slug)}`;
	if (!profileIds.every((profileId): profileId is string => typeof profileId === 'string')) {
		return redirect(`${destination}&error=members#edition-participants`, 303);
	}

	return setLocalEditionParticipants(editionId, profileIds)
		? redirect(`${destination}&updated=members#edition-participants`, 303)
		: redirect(`${destination}&error=members#edition-participants`, 303);
};
