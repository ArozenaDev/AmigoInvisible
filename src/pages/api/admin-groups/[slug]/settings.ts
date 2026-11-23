import type { APIRoute } from 'astro';

import { findLocalGroup, updateLocalGroupSettings } from '../../../../lib/server/group-directory.ts';
import { hasSameOrigin } from '../../../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const slug = params.slug ?? '';
	if (!await findLocalGroup(slug)) {
		return new Response(null, { status: 404 });
	}

	const formData = await request.formData();
	const name = formData.get('name');
	const budget = parseBudget(formData.get('budget'));
	if (typeof name !== 'string' || budget === undefined) {
		return redirectToSettings(redirect, slug, 'error=settings');
	}

	return await updateLocalGroupSettings(slug, { name, suggestedBudgetAmount: budget })
		? redirectToSettings(redirect, slug, 'updated=settings')
		: redirectToSettings(redirect, slug, 'error=settings');
};

function parseBudget(value: FormDataEntryValue | null): number | null | undefined {
	if (value === null || value === '') {
		return null;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	const numberValue = Number(value);
	return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function redirectToSettings(
	redirect: (location: string, status?: 300 | 301 | 302 | 303 | 304 | 307 | 308) => Response,
	slug: string,
	query: string,
): Response {
	return redirect(`/admin/familias/${encodeURIComponent(slug)}?${query}`, 303);
}
