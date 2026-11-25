import { SignJWT, exportJWK, importJWK, jwtVerify, type CryptoKey, type JWK } from 'jose';
import { eq, randomToken, sha256, sha256url } from '$lib/server/crypto';
import { isLive, type SessionRow } from './sessions.server';

/**
 * ij5.dev as an OpenID Connect provider — with exactly one client,
 * Cloudflare Access, so every project behind Access can be signed into with
 * the doors here, including the ones that need no device.
 *
 * Deliberately small: the authorization code flow only, PKCE (S256) required,
 * one registered redirect URI matched exactly, no refresh tokens, no implicit
 * or hybrid flows, no dynamic registration. Access keeps its own session after
 * it has the ID token.
 *
 * Configuration (see `docs/deploying.md`):
 *
 * - `OIDC_CLIENT_ID` and `OIDC_REDIRECT_URI` — plain vars;
 * - `OIDC_CLIENT_SECRET_HASH` — base64(SHA-256(client secret)), a secret;
 * - `OIDC_PRIVATE_JWK` — the RS256 signing key as a private JWK with a `kid`;
 *   Access verifies RS256, RS512 and PS512 only, so no EdDSA or ES256;
 * - `OIDC_EMAIL` — the `email` claim Access policies match on.
 *
 * Beyond the standard claims the ID token carries `strength` (`full` or
 * `limited`) and `amr`, so an Access policy can refuse a password + puzzle
 * sign-in for the apps that matter most.
 */

type Env = App.Platform['env'];

const CODE_TTL_MS = 60e3;
const TOKEN_TTL_S = 300;
const ALG = 'RS256';
const SUBJECT = 'ij5-admin';

export const oidcConfigured = (env: Env | undefined): env is Env =>
	Boolean(
		env?.OIDC_CLIENT_ID &&
			env.OIDC_CLIENT_SECRET_HASH &&
			env.OIDC_REDIRECT_URI &&
			env.OIDC_PRIVATE_JWK &&
			env.OIDC_EMAIL
	);

export const issuer = (env: Env) => env.PUBLIC_ORIGIN.replace(/\/+$/, '');

/* --------------------------------------------------------------- keys */

type Signing = { raw: string; key: CryptoKey; kid: string; pub: JWK };
let cached: Signing | null = null;

async function signingKey(env: Env): Promise<Signing> {
	if (cached && cached.raw === env.OIDC_PRIVATE_JWK) return cached;
	const jwk = JSON.parse(env.OIDC_PRIVATE_JWK!) as JWK;
	if (jwk.kty !== 'RSA' || !jwk.d || !jwk.kid) throw new Error('OIDC_PRIVATE_JWK must be a private RSA JWK with a kid.');
	const key = (await importJWK(jwk, ALG, { extractable: true })) as CryptoKey;
	const full = await exportJWK(key);
	const pub: JWK = { kty: 'RSA', n: full.n, e: full.e, kid: jwk.kid, alg: ALG, use: 'sig' };
	cached = { raw: env.OIDC_PRIVATE_JWK!, key, kid: jwk.kid, pub };
	return cached;
}

async function verifyKey(env: Env) {
	const { pub } = await signingKey(env);
	return importJWK(pub, ALG);
}

export async function jwks(env: Env) {
	return { keys: [(await signingKey(env)).pub] };
}

export function discovery(env: Env) {
	const iss = issuer(env);
	return {
		issuer: iss,
		authorization_endpoint: `${iss}/oauth/authorize`,
		token_endpoint: `${iss}/oauth/token`,
		userinfo_endpoint: `${iss}/oauth/userinfo`,
		jwks_uri: `${iss}/oauth/jwks`,
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code'],
		subject_types_supported: ['public'],
		id_token_signing_alg_values_supported: [ALG],
		token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
		code_challenge_methods_supported: ['S256'],
		scopes_supported: ['openid', 'email', 'profile'],
		claims_supported: ['iss', 'sub', 'aud', 'exp', 'iat', 'auth_time', 'nonce', 'amr', 'email', 'email_verified', 'name', 'strength'],
		prompt_values_supported: ['none', 'login']
	};
}

/* ---------------------------------------------------------- authorize */

export type AuthorizeRequest = {
	client_id: string;
	redirect_uri: string;
	state: string | null;
	nonce: string | null;
	scope: string;
	code_challenge: string;
	prompt: string | null;
	max_age: number | null;
};

/**
 * Checks an authorization request. The client and the redirect URI are
 * checked first and on their own: until both are known good, an error must be
 * shown here and never sent anywhere, or this endpoint becomes an open
 * redirect.
 */
export function parseAuthorize(
	env: Env,
	q: URLSearchParams
):
	| { ok: true; req: AuthorizeRequest }
	| { ok: false; show: string }
	| { ok: false; redirect: string } {
	const client_id = q.get('client_id') ?? '';
	const redirect_uri = q.get('redirect_uri') ?? '';
	if (!eq(client_id, env.OIDC_CLIENT_ID!)) return { ok: false, show: 'Unknown client.' };
	if (redirect_uri !== env.OIDC_REDIRECT_URI) return { ok: false, show: 'That redirect URI is not registered.' };

	const state = q.get('state');
	const fail = (error: string, description: string) => ({
		ok: false as const,
		redirect: errorRedirect(redirect_uri, state, error, description, issuer(env))
	});

	if (q.get('response_type') !== 'code') return fail('unsupported_response_type', 'Only the code flow is supported.');
	const scope = q.get('scope') ?? '';
	if (!scope.split(' ').includes('openid')) return fail('invalid_scope', 'The openid scope is required.');
	const code_challenge = q.get('code_challenge') ?? '';
	if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) {
		return fail('invalid_request', 'PKCE with S256 is required.');
	}
	const responseMode = q.get('response_mode');
	if (responseMode && responseMode !== 'query') return fail('invalid_request', 'Only response_mode=query is supported.');
	if (q.has('request') || q.has('request_uri')) return fail('request_not_supported', 'Request objects are not supported.');

	const maxAgeRaw = q.get('max_age');
	const max_age = maxAgeRaw !== null && /^\d+$/.test(maxAgeRaw) ? Number(maxAgeRaw) : null;

	return {
		ok: true,
		req: {
			client_id,
			redirect_uri,
			state,
			nonce: q.get('nonce'),
			scope,
			code_challenge,
			prompt: q.get('prompt'),
			max_age
		}
	};
}

export function errorRedirect(
	redirectUri: string,
	state: string | null,
	error: string,
	description?: string,
	iss?: string
) {
	const u = new URL(redirectUri);
	u.searchParams.set('error', error);
	if (description) u.searchParams.set('error_description', description);
	if (state) u.searchParams.set('state', state);
	if (iss) u.searchParams.set('iss', iss);
	return u.toString();
}

/** Whether the session is too old for the request's `max_age`. */
export const tooOld = (req: AuthorizeRequest, session: SessionRow, now = Date.now()) =>
	req.max_age !== null && now - session.created_at > req.max_age * 1000;

export async function issueCode(env: Env, req: AuthorizeRequest, session: SessionRow, now = Date.now()) {
	const code = randomToken();
	await env.DB.batch([
		env.DB.prepare(`DELETE FROM oidc_codes WHERE expires_at <= ?`).bind(now),
		env.DB.prepare(
			`INSERT INTO oidc_codes (hash, client_id, redirect_uri, code_challenge, nonce, scope, session_id, strength, method, auth_time, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			await sha256url(code),
			req.client_id,
			req.redirect_uri,
			req.code_challenge,
			req.nonce,
			req.scope,
			session.id,
			session.strength,
			session.method,
			session.created_at,
			now + CODE_TTL_MS
		)
	]);
	const u = new URL(req.redirect_uri);
	u.searchParams.set('code', code);
	if (req.state) u.searchParams.set('state', req.state);
	u.searchParams.set('iss', issuer(env));
	return u.toString();
}

/* -------------------------------------------------------------- token */

export type TokenError = { status: number; error: string; error_description: string; basic?: boolean };

/** Client authentication: HTTP Basic (RFC 6749 §2.3.1, form-encoded parts) or the body. */
export async function authenticateClient(
	env: Env,
	request: Request,
	form: URLSearchParams
): Promise<TokenError | null> {
	let id = form.get('client_id');
	let secret = form.get('client_secret');
	let basic = false;
	const header = request.headers.get('authorization') ?? '';
	if (/^basic /i.test(header)) {
		basic = true;
		try {
			const [rawId, rawSecret] = atob(header.slice(6).trim()).split(/:(.*)/s);
			id = decodeURIComponent(rawId.replace(/\+/g, ' '));
			secret = decodeURIComponent((rawSecret ?? '').replace(/\+/g, ' '));
		} catch {
			return { status: 401, error: 'invalid_client', error_description: 'Malformed Basic credentials.', basic };
		}
	}
	const ok =
		!!id && !!secret && eq(id, env.OIDC_CLIENT_ID!) && eq(await sha256(secret), env.OIDC_CLIENT_SECRET_HASH!);
	return ok ? null : { status: 401, error: 'invalid_client', error_description: 'Client authentication failed.', basic };
}

type CodeRow = {
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
	nonce: string | null;
	scope: string;
	session_id: string;
	strength: string;
	method: string;
	auth_time: number;
	expires_at: number;
};

const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

/** Takes a code — once, whatever happens next — and checks it against the request. */
export async function redeemCode(
	env: Env,
	form: URLSearchParams,
	now = Date.now()
): Promise<{ ok: true; row: CodeRow } | ({ ok: false } & TokenError)> {
	const bad = (error_description: string) => ({ ok: false as const, status: 400, error: 'invalid_grant', error_description });
	const code = form.get('code') ?? '';
	if (!code || code.length > 100) return bad('Missing or malformed code.');

	const row = await env.DB.prepare(
		`DELETE FROM oidc_codes WHERE hash = ? RETURNING client_id, redirect_uri, code_challenge, nonce, scope, session_id, strength, method, auth_time, expires_at`
	)
		.bind(await sha256url(code))
		.first<CodeRow>();

	if (!row || row.expires_at <= now) return bad('The code is invalid, expired or already used.');
	if (row.redirect_uri !== form.get('redirect_uri')) return bad('redirect_uri does not match the authorization request.');
	if (!eq(row.client_id, env.OIDC_CLIENT_ID!)) return bad('The code was issued to another client.');

	const verifier = form.get('code_verifier') ?? '';
	if (!VERIFIER.test(verifier)) return bad('A valid code_verifier is required.');
	const digest = await sha256url(verifier);
	if (!eq(digest, row.code_challenge)) return bad('The code_verifier does not match.');

	// The session that authorised the code must still exist: signing out (or
	// revoking it) between the redirect and the exchange cancels the login.
	if (!(await isLive(env, row.session_id, now))) return bad('The session behind this code has ended.');

	return { ok: true, row };
}

const AMR: Record<string, string[]> = {
	passkey: ['hwk', 'user'],
	token: ['pwd'],
	password: ['pwd', 'puzzle'],
	recovery: ['pwd', 'otp']
};

function profile(env: Env, row: Pick<CodeRow, 'scope' | 'strength'>) {
	// `email` whatever the scope: it is what Access policies match on, and
	// there is only one person it could ever be.
	return {
		email: env.OIDC_EMAIL,
		email_verified: true,
		...(row.scope.split(' ').includes('profile') ? { name: env.OIDC_NAME || 'ij5.dev' } : {}),
		strength: row.strength
	};
}

export async function mintTokens(env: Env, row: CodeRow, now = Date.now()) {
	const { key, kid } = await signingKey(env);
	const iat = Math.floor(now / 1000);
	const iss = issuer(env);

	const id_token = await new SignJWT({
		...profile(env, row),
		auth_time: Math.floor(row.auth_time / 1000),
		amr: AMR[row.method] ?? [],
		...(row.nonce ? { nonce: row.nonce } : {})
	})
		.setProtectedHeader({ alg: ALG, kid, typ: 'JWT' })
		.setIssuer(iss)
		.setSubject(SUBJECT)
		.setAudience(row.client_id)
		.setIssuedAt(iat)
		.setExpirationTime(iat + TOKEN_TTL_S)
		.sign(key);

	// The access token is good for one thing, `/oauth/userinfo`, for five
	// minutes. A JWT with its own audience and type, so it cannot be passed off
	// as an ID token or the other way round.
	const access_token = await new SignJWT({ scope: row.scope, strength: row.strength, client_id: row.client_id })
		.setProtectedHeader({ alg: ALG, kid, typ: 'at+jwt' })
		.setIssuer(iss)
		.setSubject(SUBJECT)
		.setAudience(`${iss}/oauth/userinfo`)
		.setIssuedAt(iat)
		.setExpirationTime(iat + TOKEN_TTL_S)
		.setJti(randomToken(16))
		.sign(key);

	return { access_token, token_type: 'Bearer', expires_in: TOKEN_TTL_S, id_token, scope: row.scope };
}

export async function userinfo(env: Env, accessToken: string) {
	try {
		const { payload } = await jwtVerify(accessToken, await verifyKey(env), {
			issuer: issuer(env),
			audience: `${issuer(env)}/oauth/userinfo`,
			typ: 'at+jwt',
			algorithms: [ALG]
		});
		return {
			sub: payload.sub,
			...profile(env, { scope: String(payload.scope ?? ''), strength: String(payload.strength ?? '') })
		};
	} catch {
		return null;
	}
}
