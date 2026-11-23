// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: vercel(),
	env: {
		schema: {
			ADMIN_USERNAME: envField.string({ context: 'server', access: 'secret', min: 1 }),
			ADMIN_PASSWORD_HASH: envField.string({ context: 'server', access: 'secret', min: 20 }),
			SESSION_SECRET: envField.string({ context: 'server', access: 'secret', min: 32 }),
		},
	},
	vite: {
		plugins: [tailwindcss()],
	},
});
