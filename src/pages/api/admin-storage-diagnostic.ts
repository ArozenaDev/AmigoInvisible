import type { APIRoute } from 'astro';

import { hasSameOrigin } from '../../lib/server/request-security.ts';
import { ADMIN_SESSION_COOKIE, getAdminSession } from '../../lib/server/sessions.ts';
import { runStorageDiagnostic } from '../../lib/server/storage-diagnostic.ts';

export const POST: APIRoute = async ({ request, cookies }) => {
	const headers = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
	try {
		if (!hasSameOrigin(request) || !await getAdminSession(cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
			return new Response(JSON.stringify({ error: 'Acceso no autorizado.' }), { status: 403, headers });
		}
		if (process.env.VERCEL !== '1') {
			return new Response(JSON.stringify({ error: 'Esta prueba solo está disponible en el despliegue remoto.' }), { status: 400, headers });
		}
		return new Response(JSON.stringify(await runStorageDiagnostic()), { headers });
	} catch {
		return new Response(JSON.stringify({ error: 'No se ha podido ejecutar la prueba.' }), { status: 503, headers });
	}
};
