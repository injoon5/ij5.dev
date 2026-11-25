import { authorize, bearerToken } from '$lib/server/api';
import { checkKey, KEY_ERROR, KEY_PREFIX, type InstallKeyRow } from './installKeys.server';

export type AppAuth =
	| { ok: true; origin: 'admin' }
	| { ok: true; origin: 'key'; key: InstallKeyRow }
	| { ok: false; status: number; error: string };

/**
 * The single door for the two routes an install key may use (Shelf plan §9.5):
 * `PUT /api/apps/{slug}` (`write`) and `GET /api/apps/{slug}/source`
 * (`read-source`). Every other route calls plain `authorize`, which turns a key
 * away — so widening what a key can do means changing this function, and
 * nothing else can do it by accident.
 *
 * The admin token passes for both. A key passes only while it is live and only
 * within its scope: a create key (no slug) may write any slug — whether it is
 * free is the write's question, answered with a 409 — and may read nothing; an
 * update key may write and read its own slug only. Every key failure is the
 * same 401 sentence.
 */
export async function authorizeApp(
	request: Request,
	env: App.Platform['env'],
	{ slug, action }: { slug: string; action: 'read-source' | 'write' }
): Promise<AppAuth> {
	const token = bearerToken(request);
	if (!token?.startsWith(KEY_PREFIX)) {
		const auth = await authorize(request, env.AUTH_HASH);
		return auth.ok ? { ok: true, origin: 'admin' } : auth;
	}

	const key = await checkKey(env, token);
	const denied = { ok: false, status: 401, error: KEY_ERROR } as const;
	if (!key) return denied;
	if (action === 'read-source' && key.slug !== slug) return denied;
	if (action === 'write' && key.slug !== null && key.slug !== slug) return denied;
	return { ok: true, origin: 'key', key };
}
