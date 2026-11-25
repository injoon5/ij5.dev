import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { MAX_LIVE_KEYS, mintKey } from '$lib/apps/installKeys.server';
import { SLUG_PATTERN } from '$lib/slugs/slugs';

/**
 * Mints a one-time install key (plan §9.5). Admin token only: Shelf mints one
 * when a New App or Change… sheet opens, and only the key goes into the
 * prompt. `{ slug }` makes an update key for that app; no slug makes a key
 * that can create one new app under a free slug.
 *
 * The response is the only time the key exists in full. Only its hash is
 * stored, so it can be shown once and never recovered.
 */

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	// An empty body is a create key; it should not have to be `{}`.
	const text = await request.text();
	let body: unknown = {};
	if (text.trim()) {
		try {
			body = JSON.parse(text);
		} catch {
			return apiError(400, 'Body must be JSON.');
		}
	}

	const slug = (body as { slug?: unknown } | null)?.slug ?? null;
	if (slug !== null && (typeof slug !== 'string' || !SLUG_PATTERN.test(slug))) {
		return apiError(422, 'That key request is not valid.', {
			fields: { slug: 'Use letters, numbers, hyphens and underscores; 1–64 characters.' }
		});
	}

	const result = await mintKey(env, slug);
	if (!result.ok) {
		return apiError(429, `There are already ${MAX_LIVE_KEYS} live install keys. Revoke one or wait for one to expire.`);
	}

	return apiJson({ key: result.key, id: result.id, expires_at: result.expires_at }, 201);
};
