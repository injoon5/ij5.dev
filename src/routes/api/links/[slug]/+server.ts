import { z } from 'zod';
import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { fieldErrors } from '$lib/forms';
import { linkFields } from '$lib/links/input';
import { linkJson } from '$lib/links/link';
import { deleteLink, getLink, updateLink } from '$lib/links/links.server';
import { bindings } from '$lib/server/bindings';

/** The shortener API's item routes. */

const patch = z
	.object({
		url: linkFields.url.optional(),
		status: linkFields.status.optional(),
		note: linkFields.note.nullish(),
		expires_at: z.number().int().positive().nullish()
	})
	.refine((v) => Object.keys(v).length > 0, 'Send at least one field to change.');

export const GET: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);
	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const row = await getLink(env, params.slug);
	return row ? apiJson(linkJson(row)) : apiError(404, 'No link with that slug.');
};

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);
	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const parsed = patch.safeParse(await request.json().catch(() => undefined));
	if (!parsed.success) return apiError(422, 'That change is not valid.', { fields: fieldErrors(parsed.error) });

	const current = await getLink(env, params.slug);
	if (!current) return apiError(404, 'No link with that slug.');

	// `null` clears a field and an absent key leaves it alone, so `in`, not `??`.
	const row = await updateLink(env, current, {
		slug: current.slug,
		target_url: parsed.data.url ?? current.target_url,
		status: parsed.data.status ?? current.status,
		note: 'note' in parsed.data ? parsed.data.note || null : current.note,
		expires_at: 'expires_at' in parsed.data ? (parsed.data.expires_at ?? null) : current.expires_at
	});
	return apiJson(linkJson(row));
};

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);
	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const current = await getLink(env, params.slug);
	if (!current) return apiError(404, 'No link with that slug.');

	await deleteLink(env, current);
	return apiJson({ slug: current.slug, deleted: true });
};
