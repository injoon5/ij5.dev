import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { authorizeApp } from '$lib/apps/appAuth.server';
import { appContent, deleteApp, getApp, getAppMeta, putApp, utf8Bytes } from '$lib/apps/apps.server';
import { KEY_ERROR, newClaim, spendAttempt } from '$lib/apps/installKeys.server';
import { SLUG_PATTERN } from '$lib/slugs/slugs';
import { parseReply } from '$lib/apps/replyParser';
import { MAX_APP_BYTES } from '$lib/apps/app';

/**
 * Item routes for Shelf's apps (plan §1.3, §9.5).
 *
 * `PUT` is the one write, whoever makes it: the admin editor, Shelf's Install
 * button, or an agent holding an install key and running `curl -T`. An app is
 * a whole document, so uploading it again is how it changes — there is no
 * PATCH. With `Content-Type: text/x-swift` the body is the raw file and its
 * header lines (`// Name:`, `// Icon:`, `// Tint:`) are read by the same
 * parser the admin and the phone use.
 */

const TOO_BIG = `An app can be at most ${MAX_APP_BYTES / 1024} KB.`;
// A JSON body carries the source plus a few short fields and the escaping
// JSON adds; anything this far past the limit cannot hold a valid app.
const MAX_JSON_BODY = MAX_APP_BYTES * 2;

const fieldErrors = (issues: { path: PropertyKey[]; message: string }[]) => {
	const fields: Record<string, string> = {};
	for (const i of issues) fields[String(i.path[0])] ??= i.message;
	return fields;
};

export const GET: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	const app = await getApp(env, params.slug);
	if (!app) return apiError(404, 'No app with that slug.');

	return apiJson(app);
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorizeApp(request, env, { slug: params.slug, action: 'write' });
	if (!auth.ok) return apiError(auth.status, auth.error);

	// A failed attempt with a key costs it one try (§9.5): enough to let an
	// agent fix its code and retry, not enough to let it guess forever.
	const fail = async (status: number, error: string, extra?: Record<string, unknown>) => {
		if (auth.origin === 'key') await spendAttempt(env, auth.key.id);
		return apiError(status, error, extra);
	};

	if (!SLUG_PATTERN.test(params.slug)) {
		return fail(422, 'That app is not valid.', {
			fields: { slug: 'Use letters, numbers, hyphens and underscores; 1–64 characters.' }
		});
	}

	const isSwift = (request.headers.get('content-type') ?? '')
		.toLowerCase()
		.startsWith('text/x-swift');
	const limit = isSwift ? MAX_APP_BYTES : MAX_JSON_BODY;

	// Refuse an announced oversize body before reading a byte of it.
	if (Number(request.headers.get('content-length') ?? 0) > limit) return fail(413, TOO_BIG);

	let input: unknown;
	if (isSwift) {
		const text = await request.text();
		if (utf8Bytes(text) > MAX_APP_BYTES) return fail(413, TOO_BIG);
		const parsed = parseReply(text);
		// The parser falls back to a default for every field but the name: a
		// tint it does not know is `blue`, a missing icon is `app`. A nameless
		// app has nothing to show under its icon.
		if (!parsed.name) {
			return fail(422, 'That app is not valid.', {
				fields: { name: 'Start the file with a // Name: line.' }
			});
		}
		input = { name: parsed.name, icon: parsed.icon, tint: parsed.tint, source: parsed.source };
	} else {
		const text = await request.text();
		if (utf8Bytes(text) > limit) return fail(413, TOO_BIG);
		try {
			input = JSON.parse(text);
		} catch {
			return fail(400, 'Body must be JSON.');
		}
		const source = (input as { source?: unknown } | null)?.source;
		if (typeof source === 'string' && utf8Bytes(source) > MAX_APP_BYTES) return fail(413, TOO_BIG);
	}

	const parsed = appContent.safeParse(input);
	if (!parsed.success) {
		return fail(422, 'That app is not valid.', { fields: fieldErrors(parsed.error.issues) });
	}

	const result = await putApp(
		env,
		params.slug,
		parsed.data,
		auth.origin === 'key'
			? { origin: 'key', keyId: auth.key.id, createOnly: auth.key.slug === null, claim: newClaim() }
			: { origin: 'admin' }
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
	const env = platform?.env;
	if (!env) return apiError(503, 'No platform bindings.');

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (!(await getAppMeta(env, params.slug))) return apiError(404, 'No app with that slug.');

	// The default keeps the data, so an app can be deleted and made again
	// without losing what it saved; deleting it too has to be asked for.
	await deleteApp(env, params.slug, url.searchParams.get('data') === 'delete');

	return apiJson({ slug: params.slug, deleted: true });
};
