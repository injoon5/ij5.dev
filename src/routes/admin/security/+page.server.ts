import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFull } from '$lib/server/guard';
import { requestMeta } from '$lib/server/auth';
import { deletePasskey, listPasskeys } from '$lib/server/webauthn';
import { listLiveKeys, revokeKey } from '$lib/server/installKeys';
import { deleteOtherSessions, deleteSession, listSessions } from '$lib/server/sessions';
import { describeAgent, listEvents, logEvent } from '$lib/server/events';
import { regenerate, remaining } from '$lib/server/recovery';
import { passwordConfigured } from '$lib/server/signIn';
import { issuer, oidcConfigured } from '$lib/server/oidc';

/**
 * Everything about getting in (§4): passkeys, sessions, recovery codes, the
 * sign-in log, and install keys.
 *
 * Registration and passkey sign-in are two-step JSON exchanges with the `/api`
 * routes (the browser's authenticator can only be driven from client
 * JavaScript); the server actions here are the rest. All of them except
 * revoking an install key and ending your own session need a `full` session.
 *
 * Live install keys (Shelf plan §9.5) are listed by id, scope and expiry —
 * never the secret, which is not stored — so a key minted into a prompt that
 * should not have been shared can be killed before it is used.
 */

export const load: PageServerLoad = async ({ platform, locals }) => {
	const env = platform?.env;
	const empty = {
		passkeys: [],
		installKeys: [],
		sessions: [],
		events: [],
		recovery: { left: 0, total: 0, created_at: null },
		password: false,
		oidc: null
	};
	if (!env) return empty;

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
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const id = await idFrom(request);
		if (!id) return fail(400, { error: 'No passkey given.' });

		await deletePasskey(env, id);
		return { deleted: id };
	},

	revokeKey: async ({ request, platform }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		const id = await idFrom(request);
		if (!id) return fail(400, { error: 'No install key given.' });

		// Already gone (used, expired and purged, or revoked elsewhere) is the
		// outcome asked for, so it is not an error.
		await revokeKey(env, id);
		return { revoked: id };
	},

	/** End one session. Ending your own is always allowed; anyone else's needs a full one. */
	revokeSession: async ({ request, platform, locals }) => {
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

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
		const env = platform?.env;
		if (!env || !locals.session) return fail(500, { error: 'No platform bindings.' });

		const ended = await deleteOtherSessions(env, locals.session.id);
		await logEvent(env, 'sign-out-all', null, requestMeta(request));
		return { endedOthers: ended };
	},

	/** A fresh sheet. The old codes stop working at once; the new ones are shown this one time. */
	recoveryCodes: async ({ platform, locals }) => {
		const denied = requireFull(locals);
		if (denied) return denied;
		const env = platform?.env;
		if (!env) return fail(500, { error: 'No platform bindings.' });

		return { codes: await regenerate(env) };
	}
};
