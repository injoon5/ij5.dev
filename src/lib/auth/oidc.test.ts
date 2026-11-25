import { describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import { b64url, sha256 } from '$lib/server/crypto';
import { discovery, issueCode, jwks, parseAuthorize } from './oidc.server';
import { createSession } from './sessions.server';
import { migratedDb, testEnv } from '$lib/server/testing/d1';
import { POST as token } from '../../routes/oauth/token/+server';
import { GET as userinfoGet } from '../../routes/oauth/userinfo/+server';
import { GET as authorize } from '../../routes/oauth/authorize/+server';

const CLIENT_ID = 'access-client';
const CLIENT_SECRET = 'access-client-secret-0123456789';
const REDIRECT = 'https://team.cloudflareaccess.com/cdn-cgi/access/callback';
const VERIFIER = 'v'.repeat(43) + '-._~0123456789';

async function setup() {
	const { env, db } = await testEnv(migratedDb());
	const { privateKey } = await generateKeyPair('RS256', { extractable: true });
	const jwk = { ...(await exportJWK(privateKey)), kid: 'test-key' };
	Object.assign(env, {
		PUBLIC_ORIGIN: 'https://ij5.dev',
		OIDC_CLIENT_ID: CLIENT_ID,
		OIDC_CLIENT_SECRET_HASH: await sha256(CLIENT_SECRET),
		OIDC_REDIRECT_URI: REDIRECT,
		OIDC_PRIVATE_JWK: JSON.stringify(jwk),
		OIDC_EMAIL: 'me@example.com'
	});
	return { env, db };
}

async function challengeOf(verifier: string) {
	return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

async function authParams(extra: Record<string, string> = {}) {
	return new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: REDIRECT,
		response_type: 'code',
		scope: 'openid email profile',
		state: 'st4te',
		nonce: 'n0nce',
		code_challenge: await challengeOf(VERIFIER),
		code_challenge_method: 'S256',
		...extra
	});
}

const meta = { ip: null, country: null, userAgent: null };

function event(env: App.Platform['env'], request: Request, locals: Partial<App.Locals> = {}) {
	return {
		request,
		url: new URL(request.url),
		params: {},
		platform: { env },
		locals: { session: null, authed: false, ...locals },
		setHeaders: () => {}
	} as never;
}

function tokenRequest(body: Record<string, string>, basic = true) {
	const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
	if (basic) headers.authorization = `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
	return new Request('https://ij5.dev/oauth/token', {
		method: 'POST',
		headers,
		body: new URLSearchParams({ grant_type: 'authorization_code', redirect_uri: REDIRECT, code_verifier: VERIFIER, ...body })
	});
}

/** Runs a handler that answers by throwing SvelteKit's redirect or error. */
async function thrown(p: unknown): Promise<{ status: number; location?: string; body?: { message: string } }> {
	try {
		await p;
	} catch (e) {
		return e as never;
	}
	throw new Error('expected a redirect or error');
}

describe('OIDC provider', () => {
	it('publishes discovery and an RSA public key, never the private half', async () => {
		const { env } = await setup();
		const d = discovery(env);
		expect(d.issuer).toBe('https://ij5.dev');
		expect(d.code_challenge_methods_supported).toEqual(['S256']);
		const { keys } = await jwks(env);
		expect(keys).toHaveLength(1);
		expect(keys[0]).toMatchObject({ kty: 'RSA', kid: 'test-key', alg: 'RS256', use: 'sig' });
		expect(keys[0]).not.toHaveProperty('d');
		expect(keys[0]).not.toHaveProperty('p');
	});

	it('never redirects to an unregistered client or URI — it shows the error instead', async () => {
		const { env } = await setup();
		expect(parseAuthorize(env, await authParams({ redirect_uri: 'https://evil.example/cb' }))).toEqual({ ok: false, show: expect.any(String) });
		expect(parseAuthorize(env, await authParams({ client_id: 'someone-else' }))).toEqual({ ok: false, show: expect.any(String) });
	});

	it('requires PKCE with S256, the openid scope, and the code flow', async () => {
		const { env } = await setup();
		for (const bad of [
			{ code_challenge_method: 'plain' } as Record<string, string>,
			{ code_challenge: 'short' },
			{ scope: 'email' },
			{ response_type: 'token' },
			{ response_mode: 'fragment' }
		]) {
			const out = parseAuthorize(env, await authParams(bad));
			expect(out.ok).toBe(false);
			expect('redirect' in out && out.redirect.startsWith(REDIRECT)).toBe(true);
			expect('redirect' in out && new URL(out.redirect).searchParams.get('state')).toBe('st4te');
		}
	});

	it('sends a signed-out browser to sign in, and back here after', async () => {
		const { env } = await setup();
		const req = new Request(`https://ij5.dev/oauth/authorize?${await authParams({ prompt: 'login' })}`);
		const r = await thrown(authorize(event(env, req)));
		expect(r.status).toBe(302);
		const login = new URL(r.location!, 'https://ij5.dev');
		expect(login.pathname).toBe('/login');
		const next = new URL(login.searchParams.get('next')!, 'https://ij5.dev');
		expect(next.pathname).toBe('/oauth/authorize');
		expect(next.searchParams.has('prompt')).toBe(false);
	});

	it('answers prompt=none without a session with login_required', async () => {
		const { env } = await setup();
		const req = new Request(`https://ij5.dev/oauth/authorize?${await authParams({ prompt: 'none' })}`);
		const r = await thrown(authorize(event(env, req)));
		const back = new URL(r.location!);
		expect(back.origin + back.pathname).toBe(REDIRECT);
		expect(back.searchParams.get('error')).toBe('login_required');
	});

	it('runs the whole code flow: authorize → token → verified ID token → userinfo', async () => {
		const { env } = await setup();
		const { row: session } = await createSession(env, 'limited', 'password', meta);
		const req = new Request(`https://ij5.dev/oauth/authorize?${await authParams()}`);
		const r = await thrown(authorize(event(env, req, { session, authed: true })));
		const back = new URL(r.location!);
		expect(back.searchParams.get('state')).toBe('st4te');
		expect(back.searchParams.get('iss')).toBe('https://ij5.dev');
		const code = back.searchParams.get('code')!;

		const res = await token(event(env, tokenRequest({ code })));
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('no-store');
		const body = (await res.json()) as { id_token: string; access_token: string; token_type: string };
		expect(body.token_type).toBe('Bearer');

		const keys = createLocalJWKSet(await jwks(env));
		const { payload } = await jwtVerify(body.id_token, keys, { issuer: 'https://ij5.dev', audience: CLIENT_ID });
		expect(payload).toMatchObject({
			sub: 'ij5-admin',
			nonce: 'n0nce',
			email: 'me@example.com',
			email_verified: true,
			strength: 'limited',
			amr: ['pwd', 'puzzle'],
			auth_time: Math.floor(session.created_at / 1000)
		});

		const info = await userinfoGet(
			event(env, new Request('https://ij5.dev/oauth/userinfo', { headers: { authorization: `Bearer ${body.access_token}` } }))
		);
		expect(await info.json()).toMatchObject({ sub: 'ij5-admin', email: 'me@example.com', strength: 'limited' });

		// The ID token is not an access token.
		const swapped = await userinfoGet(
			event(env, new Request('https://ij5.dev/oauth/userinfo', { headers: { authorization: `Bearer ${body.id_token}` } }))
		);
		expect(swapped.status).toBe(401);
	});

	it('honours a code once', async () => {
		const { env } = await setup();
		const { row } = await createSession(env, 'full', 'passkey', meta);
		const code = new URL(await issueCode(env, parseOk(env, await authParams()), row)).searchParams.get('code')!;
		expect((await token(event(env, tokenRequest({ code })))).status).toBe(200);
		const again = await token(event(env, tokenRequest({ code })));
		expect(again.status).toBe(400);
		expect(await again.json()).toMatchObject({ error: 'invalid_grant' });
	});

	it('refuses a wrong verifier, a wrong redirect URI, an expired code, and a revoked session', async () => {
		const { env, db } = await setup();
		const { row } = await createSession(env, 'full', 'passkey', meta);
		const fresh = async () => new URL(await issueCode(env, parseOk(env, await authParams()), row)).searchParams.get('code')!;

		expect((await token(event(env, tokenRequest({ code: await fresh(), code_verifier: 'w'.repeat(43) })))).status).toBe(400);
		expect((await token(event(env, tokenRequest({ code: await fresh(), redirect_uri: 'https://evil.example/cb' })))).status).toBe(400);

		const old = new URL(await issueCode(env, parseOk(env, await authParams()), row, Date.now() - 120e3)).searchParams.get('code')!;
		expect((await token(event(env, tokenRequest({ code: old })))).status).toBe(400);

		const code = await fresh();
		db.prepare('DELETE FROM sessions').run();
		expect((await token(event(env, tokenRequest({ code })))).status).toBe(400);
	});

	it('authenticates the client before spending the code', async () => {
		const { env } = await setup();
		const { row } = await createSession(env, 'full', 'passkey', meta);
		const code = new URL(await issueCode(env, parseOk(env, await authParams()), row)).searchParams.get('code')!;

		const anonymous = await token(event(env, tokenRequest({ code }, false)));
		expect(anonymous.status).toBe(401);
		const wrong = await token(
			event(env, tokenRequest({ code, client_id: CLIENT_ID, client_secret: 'nope' }, false))
		);
		expect(wrong.status).toBe(401);
		// …and the code still works for the real client, via client_secret_post.
		const ok = await token(event(env, tokenRequest({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }, false)));
		expect(ok.status).toBe(200);
	});
});

function parseOk(env: App.Platform['env'], q: URLSearchParams) {
	const out = parseAuthorize(env, q);
	if (!out.ok) throw new Error('bad params');
	return out.req;
}
