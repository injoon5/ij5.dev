import { z } from 'zod';
import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { fieldErrors } from '$lib/forms';
import { linkFields } from '$lib/links/input';
import { linkJson } from '$lib/links/link';
import { createLink, listLinks } from '$lib/links/links.server';
import { slugProblem } from '$lib/slugs/slugs.server';
import { bindings } from '$lib/server/bindings';

/** The shortener API's collection routes; `[slug]` has the item routes. */

const create = z.object({
	slug: linkFields.slug,
	url: linkFields.url,
	status: linkFields.status.default(302),
	note: linkFields.note.nullish(),
	/** Epoch milliseconds. */
	expires_at: z.number().int().positive().nullish()
});

export const GET: RequestHandler = async ({ request, platform }) => {
	const env = bindings(platform);
	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	return apiJson({ links: (await listLinks(env)).map(linkJson) });
};

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = bindings(platform);
	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const parsed = create.safeParse(await request.json().catch(() => undefined));
	if (!parsed.success) return apiError(422, 'That link is not valid.', { fields: fieldErrors(parsed.error) });

	const problem = await slugProblem(env, parsed.data.slug);
	if (problem) return apiError(409, problem);

	const row = await createLink(env, {
		slug: parsed.data.slug,
		target_url: parsed.data.url,
		status: parsed.data.status,
		note: parsed.data.note || null,
		expires_at: parsed.data.expires_at ?? null
	});
	return apiJson(linkJson(row), 201);
};
