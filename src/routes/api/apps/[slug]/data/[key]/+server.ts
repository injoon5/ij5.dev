import type { RequestHandler } from './$types';
import { apiError, apiJson, authorize } from '$lib/server/api';
import { DATA_LIMITS, KEY_RULE, isDataKey, readOne, writeData } from '$lib/apps/appData.server';
import { MAX_DATA_VALUE_BYTES } from '$lib/apps/app';
import { bindings } from '$lib/server/bindings';

/** One key of an app's data: read it, replace it, delete it. Admin token only. */

export const GET: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (!isDataKey(params.key)) return apiError(422, KEY_RULE);

	const value = await readOne(env, params.slug, params.key);
	if (value === null) return apiError(404, 'No value with that key.');

	// The stored text is already JSON; parsing and re-encoding it would only
	// cost CPU.
	return new Response(value, {
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (!isDataKey(params.key)) return apiError(422, KEY_RULE);

	// Whitespace a client sends is not data; anything this far over the value
	// limit cannot shrink under it.
	if (Number(request.headers.get('content-length') ?? 0) > MAX_DATA_VALUE_BYTES * 4) {
		return apiError(413, DATA_LIMITS.value, { key: params.key });
	}

	let value: unknown;
	try {
		value = JSON.parse(await request.text());
	} catch {
		return apiError(400, 'Body must be JSON.');
	}

	const result = await writeData(env, params.slug, { [params.key]: JSON.stringify(value) }, []);
	if (!result.ok) return apiError(413, result.error, result.key ? { key: result.key } : undefined);

	return apiJson({ key: params.key, rev: result.rev });
};

export const DELETE: RequestHandler = async ({ request, params, platform }) => {
	const env = bindings(platform);

	const auth = await authorize(request, env.AUTH_HASH);
	if (!auth.ok) return apiError(auth.status, auth.error);

	if (!isDataKey(params.key)) return apiError(422, KEY_RULE);

	// Deleting is idempotent: a retry after a dropped response must not fail.
	const result = await writeData(env, params.slug, {}, [params.key]);
	if (!result.ok) return apiError(413, result.error);

	return apiJson({ key: params.key, rev: result.rev });
};
