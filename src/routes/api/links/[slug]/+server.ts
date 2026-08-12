import { z } from 'zod';
import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { deleteSlug, getSlug, purgeLocalCache, updateSlug } from '$lib/server/slugs';
import type { SlugRow } from '$lib/types';

/** Item routes for the shortener API. */

const patch = z
	.object({
		url: z.url('Must be an absolute URL including the scheme.').optional(),
		status: z.union([z.literal(301), z.literal(302)]).optional(),
		note: z.string().trim().max(200).nullish(),
		expires_at: z.number().int().positive().nullish()
	})
	// An empty body would otherwise "succeed" while changing nothing, which
	// reads as a silent failure at the call site.
	.refine((v) => Object.keys(v).length > 0, 'Send at least one field to change.');

const publicShape = (row: SlugRow) => ({
	slug: row.slug,
	url: row.target_url,
	status: row.status,
	note: row.note,
	created_at: row.created_at,
	expires_at: row.expires_at
});

export const GET: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const row = await getSlug(env, params.slug);
	if (!row) return apiError(404, 'No link with that slug.');

	return apiJson(publicShape(row));
};

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return apiError(400, 'Body must be JSON.');
	}

	const parsed = patch.safeParse(body);
	if (!parsed.success) {
		return apiError(422, 'That change is not valid.', {
			fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))
		});
	}

	const current = await getSlug(env, params.slug);
	if (!current) return apiError(404, 'No link with that slug.');

	const next: Omit<SlugRow, 'created_at'> = {
		slug: current.slug,
		target_url: parsed.data.url ?? current.target_url,
		status: parsed.data.status ?? current.status,
		// `null` clears a field and an absent key leaves it alone, so the two
		// cases have to stay distinguishable — `??` would collapse them.
		note: 'note' in parsed.data ? (parsed.data.note ?? null) : current.note,
		expires_at:
			'expires_at' in parsed.data ? (parsed.data.expires_at ?? null) : current.expires_at
	};

	await updateSlug(env, next);
	// Only reaches this colo; §11 explains why that is still worth the call.
	await purgeLocalCache(platform, next.slug);

	return apiJson(publicShape({ ...next, created_at: current.created_at }));
};

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (!(await getSlug(env, params.slug))) return apiError(404, 'No link with that slug.');

	await deleteSlug(env, params.slug);
	await purgeLocalCache(platform, params.slug);

	return apiJson({ slug: params.slug, deleted: true });
};
