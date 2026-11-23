import type { APIRoute } from 'astro';

import { getServerSecrets } from '../../lib/server/env.ts';
import { verifyPassword } from '../../lib/server/passwords.ts';
import {
	ADMIN_SESSION_COOKIE,
	createAdminSession,
	sessionCookieOptions,
} from '../../lib/server/sessions.ts';
import {
	canAttemptLogin,
	clearLoginFailures,
	hasSameOrigin,
	recordFailedLogin,
	requestIdentifier,
} from '../../lib/server/request-security.ts';

const GENERIC_LOGIN_ERROR = 'No ha sido posible iniciar sesión.';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	if (!hasSameOrigin(request)) {
		return new Response(GENERIC_LOGIN_ERROR, { status: 403 });
	}

	const identifier = requestIdentifier(request);
	if (!canAttemptLogin(identifier)) {
		return new Response(GENERIC_LOGIN_ERROR, { status: 429 });
	}

	const formData = await request.formData();
	const username = formData.get('username');
	const password = formData.get('password');
	const { adminPasswordHash, adminUsername } = getServerSecrets();
	const passwordMatches = typeof password === 'string' && verifyPassword(password, adminPasswordHash);
	const validCredentials = typeof username === 'string' && username === adminUsername && passwordMatches;

	if (!validCredentials) {
		recordFailedLogin(identifier);
		return redirect('/admin?error=login', 303);
	}

	clearLoginFailures(identifier);
	const session = await createAdminSession();
	cookies.set(ADMIN_SESSION_COOKIE, session.id, sessionCookieOptions());
	return redirect('/admin', 303);
};
