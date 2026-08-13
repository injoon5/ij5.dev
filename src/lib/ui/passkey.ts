import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON
} from '@simplewebauthn/browser';

/**
 * Client half of the WebAuthn flows, shared by the login page (authenticate)
 * and the security page (register). Both are the same orchestration: ask the
 * server for options, drive the browser's authenticator, send the credential
 * back. The server owns the crypto; this module owns the two HTTP round trips
 * and the "did the user change their mind?" distinction.
 *
 * `error` is only set on a real failure. A cancelled or declined prompt is
 * the user backing out, so it returns `{ ok: false }` with no message and the
 * page stays quiet.
 */

export type PasskeyResult = { ok: true } | { ok: false; error?: string };

const CANCELLED = /not allowed|cancelled|abort/i;

function supported(): boolean {
	return typeof navigator !== 'undefined' && Boolean(navigator.credentials);
}

function message(e: unknown, fallback: string): string {
	return e instanceof Error ? e.message : fallback;
}

async function responseError(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { error?: string };
		return body.error ?? fallback;
	} catch {
		return fallback;
	}
}

export async function signInWithPasskey(): Promise<PasskeyResult> {
	if (!supported()) return { ok: false, error: 'This browser does not support passkeys.' };

	try {
		const begin = await fetch('/api/passkey/login/begin', { method: 'POST' });
		const body = (await begin.json()) as { options?: PublicKeyCredentialRequestOptionsJSON };
		if (!begin.ok || !body.options) {
			return { ok: false, error: 'Passkey sign-in is unavailable right now.' };
		}

		const response = await startAuthentication({ optionsJSON: body.options });

		const done = await fetch('/api/passkey/login/complete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ response: response as AuthenticationResponseJSON })
		});

		if (!done.ok) return { ok: false, error: await responseError(done, 'That passkey did not work.') };
		return { ok: true };
	} catch (e) {
		const text = message(e, 'Passkey sign-in was cancelled.');
		if (CANCELLED.test(text)) return { ok: false };
		return { ok: false, error: text };
	}
}

export async function registerPasskey(name: string): Promise<PasskeyResult> {
	if (!supported()) return { ok: false, error: 'This browser does not support passkeys.' };

	try {
		const begin = await fetch('/api/passkey/register/begin', { method: 'POST' });
		const body = (await begin.json()) as { options?: PublicKeyCredentialCreationOptionsJSON };
		if (!begin.ok || !body.options) {
			return { ok: false, error: 'Passkey registration is unavailable right now.' };
		}

		const response = await startRegistration({ optionsJSON: body.options });

		const done = await fetch('/api/passkey/register/complete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ response: response as RegistrationResponseJSON, name })
		});

		if (!done.ok) return { ok: false, error: await responseError(done, 'That passkey could not be saved.') };
		return { ok: true };
	} catch (e) {
		const text = message(e, 'Passkey registration was cancelled.');
		if (CANCELLED.test(text)) return { ok: false };
		return { ok: false, error: text };
	}
}
