import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/auth/guard.server';
import { requestMeta } from '$lib/server/request';
import { deletePasskey, listPasskeys } from '$lib/auth/webauthn.server';
import { listLiveKeys, revokeKey } from '$lib/apps/installKeys.server';
import { deleteOtherSessions, deleteSession, listSessions } from '$lib/auth/sessions.server';
import { listEvents, logEvent } from '$lib/auth/events.server';
import { describe as describeAgent } from '$lib/analytics/userAgent';
import { regenerate, remaining } from '$lib/auth/recovery.server';
import { passwordConfigured } from '$lib/auth/signIn.server';
import { issuer, oidcConfigured } from '$lib/auth/oidc.server';
import { bindings } from '$lib/server/bindings';

/**
 * Everything about getting in: passkeys, sessions, recovery codes, the
 * sign-in log, and install keys.
 *
 * Registration and passkey sign-in are two-step JSON exchanges with the `/api`
 * routes (the browser's authenticator can only be driven from client
 * JavaScript); the server actions here are the rest. All of them except
 * revoking an install key and ending your own session need a `full` session.
 *
 * Live install keys are listed by id, scope and expiry —
 * never the secret, which is not stored — so a key minted into a prompt that
 * should not have been shared can be killed before it is used.
 */

export const load: PageServerLoad = async ({ platform, locals }) => {
	const env = bindings(platform);

	const [passkeys, installKeys, sessions, events, recovery] = await Promise.all([
		listPasskeys(env),
		listLiveKeys(env),
		listSessions(env),
		listEvents(env),
		remaining(env)
	]);

	return {
		passkeys,
		installKeys,
		sessions: sessions.map((s) => ({
			id: s.id,
			strength: s.strength,
			method: s.method,
			created_at: s.created_at,
			last_seen_at: s.last_seen_at,
			expires_at: s.expires_at,
			where: [describeAgent(s.user_agent), s.country].filter(Boolean).join(' · '),
			ip: s.ip,
			current: s.id === locals.session?.id
		})),
		events: events.map((e) => ({
			id: e.id,
			at: e.at,
			kind: e.kind,
			method: e.method,
			where: [describeAgent(e.user_agent), e.country, e.ip].filter(Boolean).join(' · ')
		})),
		recovery,
		password: passwordConfigured(env),
		oidc: oidcConfigured(env) ? { discovery: `${issuer(env)}/.well-known/openid-configuration` } : null
	};
};

const idFrom = async (request: Request) => String((await request.formData()).get('id') ?? '');

export const actions: Actions = {
	delete: async ({ request, platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = bindings(platform);

		const id = await idFrom(request);
		if (!id) return fail(400, { error: 'No passkey given.' });

		await deletePasskey(env, id);
		return { deleted: id };
	},

	revokeKey: async ({ request, platform }) => {
		const env = bindings(platform);

		const id = await idFrom(request);
		if (!id) return fail(400, { error: 'No install key given.' });

		// Already gone (used, expired and purged, or revoked elsewhere) is the
		// outcome asked for, so it is not an error.
		await revokeKey(env, id);
		return { revoked: id };
	},

	/** End one session. Ending your own is always allowed; anyone else's needs a full one. */
	revokeSession: async ({ request, platform, locals }) => {
		const env = bindings(platform);

		const id = await idFrom(request);
		if (!id) return fail(400, { error: 'No session given.' });
		if (id !== locals.session?.id) {
			const denied = requireFull(locals);
			if (denied) return denied;
		}

		await deleteSession(env, id);
		return { ended: id };
	},

	signOutOthers: async ({ request, platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = bindings(platform);
		const ended = await deleteOtherSessions(env, locals.session!.id);
		await logEvent(env, 'sign-out-all', null, requestMeta(request));
		return { endedOthers: ended };
	},

	/** A fresh sheet. The old codes stop working at once; the new ones are shown this one time. */
	recoveryCodes: async ({ platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = bindings(platform);

		return { codes: await regenerate(env) };
	}
};
