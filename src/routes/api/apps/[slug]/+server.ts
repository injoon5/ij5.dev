import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize, KEY_ERROR } from '$lib/server/api';
import { authorizeApp } from '$lib/apps/appAuth.server';
import { appContent, deleteApp, getApp, getAppMeta, putApp } from '$lib/apps/apps.server';
import { fieldErrors } from '$lib/forms';
import { spendAttempt } from '$lib/apps/installKeys.server';
import { SLUG_PATTERN } from '$lib/slugs/slugs';
import { parseReply } from '$lib/apps/replyParser';
import { MAX_APP_BYTES, SOURCE_TOO_BIG, utf8Bytes } from '$lib/apps/app';
import { bindings } from '$lib/server/bindings';

/**
 * Item routes for Shelf's apps.
 *
 * `PUT` is the one write, whoever makes it: the admin editor, Shelf's Install
 * button, or an agent holding an install key and running `curl -T`. An app is
 * a whole document, so uploading it again is how it changes — there is no
 * PATCH. With `Content-Type: text/x-swift` the body is the raw file and its
 * header lines (`// Name:`, `// Icon:`, `// Tint:`) are read by the same
 * parser the admin and the phone use.
 */

// A JSON body carries the source plus a few short fields and the escaping
// JSON adds; anything this far past the limit cannot hold a valid app.
const MAX_JSON_BODY = MAX_APP_BYTES * 2;

export const GET: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const app = await getApp(env, params.slug);
	if (!app) return apiError(404, 'No app with that slug.');

	return apiJson(app);
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);

	const auth = await authorizeApp(request, env, { slug: params.slug, action: 'write' });
	if (!auth.ok) return apiError(auth.status, auth.error);

	const fail = async (status: number, error: string, extra?: Record<string, unknown>) => {
		if (auth.origin === 'key') await spendAttempt(env, auth.key.id);
		return apiError(status, error, extra);
	};

	if (!SLUG_PATTERN.test(params.slug)) {
		return fail(422, 'That app is not valid.', {
			fields: { slug: 'Use letters, numbers, hyphens and underscores; 1–64 letters, numbers, hyphens and underscores.' }
		});
	}

	const isSwift = (request.headers.get('content-type') ?? '')
		.toLowerCase()
		.startsWith('text/x-swift');
	const limit = isSwift ? MAX_APP_BYTES : MAX_JSON_BODY;

	if (Number(request.headers.get('content-length') ?? 0) > limit) return fail(413, SOURCE_TOO_BIG);

	let input: unknown;
	if (isSwift) {
		const text = await request.text();
		if (utf8Bytes(text) > MAX_APP_BYTES) return fail(413, SOURCE_TOO_BIG);
		const parsed = parseReply(text);
		// The name is the one field the parser has no fallback for: a nameless
		// app has nothing to show under its icon.
		if (!parsed.name) {
			return fail(422, 'That app is not valid.', {
				fields: { name: 'Start the file with a // Name: line.' }
			});
		}
		input = { name: parsed.name, icon: parsed.icon, tint: parsed.tint, source: parsed.source };
	} else {
		const text = await request.text();
		if (utf8Bytes(text) > limit) return fail(413, SOURCE_TOO_BIG);
		try {
			input = JSON.parse(text);
		} catch {
			return fail(400, 'Body must be JSON.');
		}
		const source = (input as { source?: unknown } | null)?.source;
		if (typeof source === 'string' && utf8Bytes(source) > MAX_APP_BYTES) return fail(413, SOURCE_TOO_BIG);
	}

	const parsed = appContent.safeParse(input);
	if (!parsed.success) {
		return fail(422, 'That app is not valid.', { fields: fieldErrors(parsed.error) });
	}

	const result = await putApp(
		env,
		params.slug,
		parsed.data,
		auth.origin === 'key' ? { origin: 'key', key: auth.key } : { origin: 'admin' }
	);

	if (!result.ok) {
		// A create key never overwrites: a taken slug is the agent's cue to
		// pick another, and costs it a try like any other failure.
		if (result.reason === 'taken') return fail(409, 'That slug is taken. Pick another.');
		// Lost the race for the key: the other request installed, this one
		// did not, and from here the key is simply used.
		return apiError(401, KEY_ERROR);
	}

	return apiJson(result.app, result.created ? 201 : 200);
};

export const DELETE: RequestHandler = async ({ request, params, url, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (!(await getAppMeta(env, params.slug))) return apiError(404, 'No app with that slug.');

	await deleteApp(env, params.slug, url.searchParams.get('data') === 'delete');

	return apiJson({ slug: params.slug, deleted: true });
};
