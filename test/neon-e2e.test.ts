import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import test from 'node:test';
import pg from 'pg';
import { hashPassword } from '../src/lib/server/passwords.ts';

// Opt-in only: this creates synthetic records and must use an isolated branch.
const url = process.env.TEST_E2E_DATABASE_URL;
test('Neon y Astro: acceso, participantes, sorteo y consulta con PIN', { skip: !url, timeout: 120_000 }, async () => {
	if (!url) return;
	const listener = createServer();
	await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
	const address = listener.address();
	if (!address || typeof address === 'string') throw new Error('No se ha podido asignar un puerto de prueba.');
	const port = address.port;
	await new Promise<void>((resolve) => listener.close(() => resolve()));
	const origin = `http://127.0.0.1:${port}`;
	const slug = `e2e-${randomBytes(6).toString('hex')}`;
	const adminPassword = randomBytes(16).toString('base64url');
	const groupPassword = randomBytes(16).toString('base64url');
	const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', String(port)], {
		cwd: process.cwd(), stdio: 'ignore', env: { ...process.env, VERCEL: process.env.TEST_HOSTED_MODE === '1' ? '1' : '0', STORAGE_BACKEND:'postgres', DATABASE_URL:url,
			ADMIN_USERNAME:'integration-test', ADMIN_PASSWORD_HASH:hashPassword(adminPassword), SESSION_SECRET:randomBytes(32).toString('hex') },
	});
	const pool = new pg.Pool({ connectionString:url, max:2, connectionTimeoutMillis:10_000 });
	let stage = 'inicio del servidor';
	const post = (path: string, body: Record<string, string>, cookie?: string) => fetch(`${origin}${path}`, {
		method:'POST', headers: { origin, 'content-type':'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
		body:new URLSearchParams(body), redirect:'manual',
	});
	try {
		let ready = false;
		for (let i = 0; i < 120; i++) {
			if (child.exitCode !== null) break;
			try { const response = await fetch(`${origin}/admin`); if (response.ok) { ready = true; break; } } catch { /* server starting */ }
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		assert.ok(ready, 'El servidor local no ha arrancado.');
		stage = 'inicio de sesión de administración';
		const login = await post('/api/admin-session', { username:'integration-test', password:adminPassword });
		assert.equal(login.status, 303);
		assert.equal(login.headers.get('location'), '/admin');
		const adminCookie = login.headers.get('set-cookie')?.split(';')[0];
		assert.ok(adminCookie?.startsWith('ai_admin_session='));
		stage = 'creación de familia';
		const group = await post('/api/admin-groups', { name:'Grupo ficticio', slug, password:groupPassword, budget:'' }, adminCookie);
		assert.equal(group.status, 303);
		assert.ok(group.headers.get('location')?.includes('created=group'));
		stage = 'creación de participantes';
		for (let i = 0; i < 4; i++) {
			const participant = await post(`/api/admin-groups/${slug}/participants`, { displayName:`Prueba ${i}`, alias:'' }, adminCookie);
			assert.equal(participant.status, 303);
			assert.ok(!participant.headers.get('location')?.includes('error='));
		}
		const profiles = await pool.query('SELECT p.id FROM participants p JOIN groups g ON g.id=p.group_id WHERE g.slug=$1 ORDER BY p.display_name', [slug]);
		assert.equal(profiles.rowCount, 4);
		stage = 'generación de PIN';
		const pinResponse = await post(`/api/admin-groups/${slug}/participants/${profiles.rows[0].id}/pin`, {}, adminCookie);
		assert.equal(pinResponse.status, 200);
		const { pin } = await pinResponse.json() as { pin: string };
		assert.match(pin, /^\d{4}$/);
		stage = 'creación y generación del sorteo';
		const created = await post(`/api/admin-groups/${slug}/editions`, { year:'2026' }, adminCookie);
		assert.equal(created.status, 303);
		assert.ok(created.headers.get('location')?.includes('created=edition'));
		const editions = await pool.query('SELECT e.id, e.document FROM editions e JOIN groups g ON g.id=e.group_id WHERE g.slug=$1', [slug]);
		assert.equal(editions.rowCount, 1);
		const edition = editions.rows[0];
		const generated = await post(`/api/admin-groups/${slug}/editions/${edition.id}/generate`, {}, adminCookie);
		assert.ok(generated.headers.get('location')?.includes('generated=edition'));
		const activated = await post(`/api/admin-groups/${slug}/editions/${edition.id}/activate`, {}, adminCookie);
		assert.ok(activated.headers.get('location')?.includes('activated=edition'));
		stage = 'acceso de familia y consulta individual';
		const groupLogin = await post(`/${slug}/session`, { password:groupPassword });
		const groupCookie = groupLogin.headers.get('set-cookie')?.split(';')[0];
		assert.ok(groupCookie?.startsWith('ai_group_session='));
		const search = await fetch(`${origin}/${slug}/participants?q=Prueba`, { headers:{ cookie:groupCookie } });
		assert.equal(search.status, 200);
		const suggestions = await search.json() as { participants: { id:string }[] };
		assert.equal(suggestions.participants.length, 4);
		const participant = edition.document.participants.find((p: {profileId:string}) => p.profileId === profiles.rows[0].id);
		assert.ok(participant);
		const wrongPin = pin === '0000' ? '0001' : '0000';
		assert.equal((await post(`/${slug}/reveal`, { participantId:participant.id, pin:wrongPin }, groupCookie)).status, 403);
		for (let i = 0; i < 2; i++) {
			const reveal = await post(`/${slug}/reveal`, { participantId:participant.id, pin }, groupCookie);
			assert.equal(reveal.status, 200);
			const result = await reveal.json() as { recipientName?:string };
			assert.ok(result.recipientName?.startsWith('Prueba '));
		}
	} catch {
		throw new Error(`Ha fallado la etapa: ${stage}.`);
	} finally {
		child.kill('SIGTERM');
		await pool.end();
	}
});
