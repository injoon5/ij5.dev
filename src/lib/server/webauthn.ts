import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse
} from '@simplewebauthn/server';
import { decodeClientDataJSON, isoBase64URL } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/browser';

/**
 * Passkey sign-in (§4) — WebAuthn for the single admin user.
 *
 * The token login proves you know a secret. A passkey proves you hold a
 * private key that never leaves your device, so there is nothing to type, leak
 * or phish. The credential is discoverable (a resident key), so the browser
 * can offer it without a username.
 *
 * D1 is the source of truth for registered credentials; challenges are
 * one-time KV values that expire in five minutes, so a challenge is never
 * stored alongside the secret it protects for long.
 */

type Env = App.Platform['env'];

/** A stable handle for the one user, so the same account owns every key. */
const USER_HANDLE = new TextEncoder().encode('ij5-admin');

/** How long a challenge is valid, and how long it stays in KV. */
const CHALLENGE_TTL = 300;

const challengeKey = (challenge: string) => `passkey:challenge:${challenge}`;

/* ------------------------------------------------------------------ storage */

export type PasskeyRow = {
	id: string;
	name: string;
	public_key: string;
	counter: number;
	transports: string;
	created_at: number;
	last_used_at: number | null;
};

const ROW_SELECT = `id, name, public_key, counter, transports, created_at, last_used_at`;

export async function listPasskeys(env: Env): Promise<PasskeyRow[]> {
	const { results } = await env.DB.prepare(
		`SELECT ${ROW_SELECT} FROM passkeys ORDER BY created_at`
	).all<PasskeyRow>();
	return results;
}

export async function getPasskey(env: Env, id: string): Promise<PasskeyRow | null> {
	return env.DB.prepare(`SELECT ${ROW_SELECT} FROM passkeys WHERE id = ?`)
		.bind(id)
		.first<PasskeyRow>();
}

/* ----------------------------------------------------------- registration */

export async function beginRegistration(env: Env, rpID: string, rpName: string) {
	const existing = await listPasskeys(env);

	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userName: 'ij5.dev',
		userDisplayName: 'ij5.dev',
		userID: USER_HANDLE,
		attestationType: 'none',
		authenticatorSelection: {
			residentKey: 'required',
			userVerification: 'preferred'
		},
		excludeCredentials: existing.map((p) => ({ id: p.id }))
	});

	await env.KV.put(challengeKey(options.challenge), 'register', {
		expirationTtl: CHALLENGE_TTL
	});

	return options;
}

export async function finishRegistration(
	env: Env,
	response: RegistrationResponseJSON,
	rpID: string,
	expectedOrigin: string,
	name: string
): Promise<PasskeyRow> {
	const challenge = await takeChallenge(env, response, 'register');

	const { verified, registrationInfo } = await verifyRegistrationResponse({
		response,
		expectedChallenge: challenge,
		expectedOrigin,
		expectedRPID: rpID
	});
	if (!verified || !registrationInfo) throw new Error('That passkey could not be verified.');

	const credential = registrationInfo.credential;
	const row: PasskeyRow = {
		id: credential.id,
		name,
		public_key: isoBase64URL.fromBuffer(credential.publicKey),
		counter: credential.counter,
		transports: JSON.stringify(credential.transports ?? []),
		created_at: Date.now(),
		last_used_at: null
	};

	await env.DB.prepare(
		`INSERT INTO passkeys (id, name, public_key, counter, transports, created_at, last_used_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(row.id, row.name, row.public_key, row.counter, row.transports, row.created_at, null)
		.run();

	return row;
}

/* ---------------------------------------------------------- authentication */

export async function beginAuthentication(env: Env, rpID: string) {
	const passkeys = await listPasskeys(env);

	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: 'preferred',
		allowCredentials: passkeys.map((p) => ({
			id: p.id,
			transports: safeJson(p.transports, [])
		}))
	});

	await env.KV.put(challengeKey(options.challenge), 'login', {
		expirationTtl: CHALLENGE_TTL
	});

	return options;
}

export async function finishAuthentication(
	env: Env,
	response: AuthenticationResponseJSON,
	rpID: string,
	expectedOrigin: string
): Promise<PasskeyRow> {
	const challenge = await takeChallenge(env, response, 'login');

	const stored = await getPasskey(env, response.id);
	if (!stored) throw new Error('That passkey is not registered here.');

	const { verified, authenticationInfo } = await verifyAuthenticationResponse({
		response,
		expectedChallenge: challenge,
		expectedOrigin,
		expectedRPID: rpID,
		credential: {
			id: stored.id,
			publicKey: isoBase64URL.toBuffer(stored.public_key),
			counter: stored.counter,
			transports: safeJson(stored.transports, [])
		}
	});
	if (!verified) throw new Error('That passkey could not be verified.');

	// The counter only ever rises on a genuine authenticator; a cloned or
	// replayed one answers with a stale number. Store the new one so the next
	// login can tell the difference.
	await env.DB.prepare(
		`UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?`
	)
		.bind(authenticationInfo.newCounter, Date.now(), stored.id)
		.run();

	return { ...stored, counter: authenticationInfo.newCounter };
}

export async function deletePasskey(env: Env, id: string): Promise<void> {
	await env.DB.prepare(`DELETE FROM passkeys WHERE id = ?`).bind(id).run();
}

/* ---------------------------------------------------------------- helpers */

/**
 * Reads a challenge out of the client data, checks it is one this server
 * issued for the given purpose, and consumes it. A challenge is single-use:
 * consuming it even on failure means a captured response cannot be replayed.
 */
async function takeChallenge(
	env: Env,
	response: { response: { clientDataJSON: string } },
	purpose: 'register' | 'login'
): Promise<string> {
	const clientData = decodeClientDataJSON(response.response.clientDataJSON);
	const key = challengeKey(clientData.challenge);

	const stored = await env.KV.get(key);
	await env.KV.delete(key);

	if (stored !== purpose) throw new Error('That challenge is unknown, expired or reused.');
	return clientData.challenge;
}

function safeJson<T>(raw: string, fallback: T): T {
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}
