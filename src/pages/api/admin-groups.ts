import type { APIRoute } from 'astro';

import { createLocalGroup } from '../../lib/server/group-directory.ts';
import { isValidSlug } from '../../lib/domain/group.ts';
import { hashPassword } from '../../lib/server/passwords.ts';
import { hasSameOrigin } from '../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../lib/server/sessions.ts';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	if (!hasSameOrigin(request) || !getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
		return new Response(null, { status: 403 });
	}

	const formData = await request.formData();
	const name = formData.get('name');
	const slug = formData.get('slug');
	const password = formData.get('password');
	const budgetValue = formData.get('budget');
	const budget = parseBudget(budgetValue);

	if (
		typeof name !== 'string' ||
		!name.trim() ||
		typeof slug !== 'string' ||
		!isValidSlug(slug) ||
		typeof password !== 'string' ||
		password.length < 6 ||
		budget === undefined
	) {
		return redirect('/admin/familias/nueva?error=validation', 303);
	}

	const group = createLocalGroup({
		accessPasswordHash: hashPassword(password),
		name,
		slug,
		suggestedBudgetAmount: budget,
	});

	return group === null
		? redirect('/admin/familias/nueva?error=validation', 303)
		: redirect('/admin?created=group', 303);
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
