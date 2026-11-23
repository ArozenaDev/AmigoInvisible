import type { APIRoute } from 'astro';

import { listLocalEditions, setLocalEditionExclusions } from '../../../../../../lib/server/edition-directory.ts';
import type { EditionExclusion } from '../../../../../../lib/domain/edition.ts';
import { findLocalGroup } from '../../../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	const editionId = params.id ?? '';
	const group = await findLocalGroup(slug);
	const destination = `/admin/sorteos/${editionId}?family=${encodeURIComponent(slug)}`;
	if (!group || group.archivedAt !== null || !(await listLocalEditions(group.id)).some((edition) => edition.id === editionId)) {
		return new Response(null, { status: 404 });
	}

	const exclusionPairs = (await request.formData()).getAll('exclusionPairs');
	const exclusions: EditionExclusion[] = [];
	for (const pair of exclusionPairs) {
		if (typeof pair !== 'string') {
			return redirect(`${destination}&error=exclusions#edition-exclusions`, 303);
		}

		let decodedPair: unknown;
		try {
			decodedPair = JSON.parse(pair);
		} catch {
			return redirect(`${destination}&error=exclusions#edition-exclusions`, 303);
		}

		if (
			!Array.isArray(decodedPair) ||
			decodedPair.length !== 2 ||
			typeof decodedPair[0] !== 'string' ||
			typeof decodedPair[1] !== 'string'
		) {
			return redirect(`${destination}&error=exclusions#edition-exclusions`, 303);
		}
		exclusions.push({ firstParticipantId: decodedPair[0], secondParticipantId: decodedPair[1] });
	}

	return await setLocalEditionExclusions(editionId, exclusions)
		? redirect(`${destination}&updated=exclusions#edition-exclusions`, 303)
		: redirect(`${destination}&error=exclusions#edition-exclusions`, 303);
};
