import { z } from 'zod';
import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { RESERVED, SLUG_PATTERN } from '$lib/reserved';
import { getFile } from '$lib/server/files';
import { getPaste } from '$lib/server/pastes';
import { createSlug, getSlug, isTargetUrl, listSlugs } from '$lib/server/slugs';
import type { SlugRow } from '$lib/types';

/**
 * The shortener API. Collection routes; `[slug]` handles the item routes.
 *
 * It goes through the same `slugs.ts` helpers the admin forms use, so a link
 * created here mirrors into KV exactly like one created in the UI. Two write
 * paths that reach D1 by different routes is how a shortener ends up with a row
 * the redirect hook cannot see.
 */

const create = z.object({
	slug: z
		.string()
		.trim()
		.regex(SLUG_PATTERN, 'Letters, numbers, hyphens and underscores; 1–64 characters.'),
	url: z
		.string()
		.trim()
		.refine(isTargetUrl, 'Must be a full URL — https://, mailto:, tel: or sms:'),
	// 301 is cached by the browser indefinitely, so it stays opt-in: a permanent
	// redirect you later want to repoint cannot be recalled from anyone who
	// already followed it.
	status: z.union([z.literal(301), z.literal(302)]).default(302),
	note: z.string().trim().max(200).nullish(),
	/** Epoch milliseconds. Expiry is lazy — the hook compares it on read. */
	expires_at: z.number().int().positive().nullish()
});

const publicShape = (row: SlugRow) => ({
	slug: row.slug,
	url: row.target_url,
	status: row.status,
	note: row.note,
	created_at: row.created_at,
	expires_at: row.expires_at
});

export const GET: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const rows = await listSlugs(env);
	return apiJson({ links: rows.map(publicShape) });
};

export const POST: RequestHandler = async ({ request, platform }) => {
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

	const parsed = create.safeParse(body);
	if (!parsed.success) {
		return apiError(422, 'That link is not valid.', {
			fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))
		});
	}

	// The hook skips reserved names entirely, so a link named after one would
	// simply never resolve. Refusing here beats creating a link that silently
	// does nothing.
	if (RESERVED.has(parsed.data.slug)) {
		return apiError(409, `"${parsed.data.slug}" is reserved by the site itself.`);
	}

	if (await getSlug(env, parsed.data.slug)) {
		return apiError(409, 'That slug is taken.');
	}

	if (await getPaste(env, parsed.data.slug)) {
		return apiError(409, 'That slug is taken.');
	}

	if (await getFile(env, parsed.data.slug)) {
		return apiError(409, 'That slug is taken.');
	}

	const row: Omit<SlugRow, 'created_at'> = {
		slug: parsed.data.slug,
		target_url: parsed.data.url,
		status: parsed.data.status,
		note: parsed.data.note ?? null,
		expires_at: parsed.data.expires_at ?? null
	};

	await createSlug(env, row);

	const saved = await getSlug(env, row.slug);
	return apiJson(saved ? publicShape(saved) : { ...row, created_at: Date.now() }, 201);
};
