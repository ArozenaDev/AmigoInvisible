import type { APIRoute } from 'astro';

import { findLocalGroup } from '../../../../lib/server/group-directory.ts';
import { createLocalParticipant } from '../../../../lib/server/participant-directory.ts';
import { hasSameOrigin } from '../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	try {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const group = await findLocalGroup(slug);
	const formData = await request.formData();
	const displayName = formData.get('displayName');
	const alias = formData.get('alias');

	if (!group || group.archivedAt !== null || typeof displayName !== 'string' || (typeof alias !== 'string' && alias !== null)) {
		return redirect(`/admin/participantes?family=${encodeURIComponent(slug)}&error=validation`, 303);
	}

	const participant = await createLocalParticipant({
		alias: typeof alias === 'string' && alias.trim().length > 0 ? alias : null,
		displayName,
		groupId: group.id,
	});

	return participant === null
		? redirect(`/admin/participantes?family=${encodeURIComponent(slug)}&error=validation`, 303)
		: redirect(`/admin/participantes?family=${encodeURIComponent(slug)}`, 303);
	} catch {
		// Do not expose infrastructure errors or leave the browser on an API URL.
		return redirect(`/admin/participantes?family=${encodeURIComponent(params.slug ?? '')}&error=save`, 303);
	}
};
