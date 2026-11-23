import { ADMIN_PASSWORD_HASH, ADMIN_USERNAME, SESSION_SECRET } from 'astro:env/server';

/**
 * Obtiene los secretos requeridos por las rutas de servidor.
 *
 * No debe importarse desde componentes de cliente ni módulos compartidos: Astro
 * bloquea los secretos declarados en la configuración fuera del contexto server.
 */
export function getServerSecrets() {
	return {
		adminPasswordHash: ADMIN_PASSWORD_HASH,
		adminUsername: ADMIN_USERNAME,
		sessionSecret: SESSION_SECRET,
	};
}
