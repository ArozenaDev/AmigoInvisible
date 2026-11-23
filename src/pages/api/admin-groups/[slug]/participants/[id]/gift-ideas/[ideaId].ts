import type { APIRoute } from 'astro';

import { findLocalGroup } from '../../../../../../../lib/server/group-directory.ts';
import { removeLocalGiftIdea, updateLocalGiftIdea } from '../../../../../../../lib/server/gift-idea-directory.ts';
import { hasSameOrigin } from '../../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const participantId = params.id ?? '';
	const ideaId = params.ideaId ?? '';
	const group = await findLocalGroup(slug);
	if (!group || group.archivedAt !== null) {
		return new Response(null, { status: 404 });
	}

	const formData = await request.formData();
	if (formData.get('intent') === 'delete') {
		return await removeLocalGiftIdea(group.id, participantId, ideaId)
			? redirectToGifts(redirect, participantId, slug, 'updated=gifts')
			: redirectToGifts(redirect, participantId, slug, 'error=gifts');
	}

	const title = formData.get('title');
	const affiliateUrl = formData.get('affiliateUrl');
	const imageUrl = formData.get('imageUrl');
	if (typeof title !== 'string' || typeof affiliateUrl !== 'string' || typeof imageUrl !== 'string') {
		return redirectToGifts(redirect, participantId, slug, 'error=gifts');
	}

	return await updateLocalGiftIdea(group.id, participantId, ideaId, { affiliateUrl, imageUrl, title })
		? redirectToGifts(redirect, participantId, slug, 'updated=gifts')
		: redirectToGifts(redirect, participantId, slug, 'error=gifts');
};

function redirectToGifts(
	redirect: (location: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response,
	participantId: string,
	slug: string,
	query: string,
): Response {
	return redirect(`/admin/participantes/${participantId}?family=${encodeURIComponent(slug)}&${query}`, 303);
}
