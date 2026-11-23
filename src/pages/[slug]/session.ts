import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';

import { findAvailableLocalGroup } from '../../lib/server/group-directory.ts';
import { hashPassword, verifyPassword } from '../../lib/server/passwords.ts';
import {
	canAttemptLogin,
	clearLoginFailures,
	hasSameOrigin,
	recordFailedLogin,
	requestIdentifier,
} from '../../lib/server/request-security.ts';
import {
	createGroupSession,
	GROUP_SESSION_COOKIE,
	sessionCookieOptions,
} from '../../lib/server/sessions.ts';

// Ensures unknown, archived and valid slugs take the same password-verification path.
const unknownGroupPasswordHash = hashPassword(randomBytes(32).toString('base64url'));

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
	const slug = params.slug ?? '';
	if (!hasSameOrigin(request)) {
		return new Response(null, { status: 403 });
	}

	const identifier = `group:${slug}:${requestIdentifier(request)}`;
	if (!canAttemptLogin(identifier)) {
		return redirect(`/${slug}?error=access`, 303);
	}

	const password = (await request.formData()).get('password');
	const group = await findAvailableLocalGroup(slug);
	const passwordMatches =
		typeof password === 'string' && verifyPassword(password, group?.accessPasswordHash ?? unknownGroupPasswordHash);

	if (!passwordMatches || group === null) {
		recordFailedLogin(identifier);
		return redirect(`/${slug}?error=access`, 303);
	}

	clearLoginFailures(identifier);
	const session = await createGroupSession(group.id);
	cookies.set(GROUP_SESSION_COOKIE, session.id, sessionCookieOptions(`/${slug}`));
	return redirect(`/${slug}`, 303);
};
