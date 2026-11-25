import type { Handle } from '@sveltejs/kit';

/**
 * SvelteKit's cross-site form check, moved here (see `svelte.config.js`) so
 * `/oauth/token` can be exempt: Cloudflare Access posts a form to it from its
 * own servers, with no Origin header, and authenticates with a client secret
 * instead. Everything else keeps the original rule, byte for byte: a
 * form-encoded write from another origin, or with no origin, is refused.
 */
const FORM_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
];
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT = new Set(['/oauth/token', '/oauth/userinfo']);

export function crossSiteForm(request: Request, url: URL) {
	if (!WRITES.has(request.method) || CSRF_EXEMPT.has(url.pathname)) return false;
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
	if (!FORM_TYPES.includes(type)) return false;
	return request.headers.get('origin') !== url.origin;
}

export const rejectCrossSiteForms: Handle = async ({ event, resolve }) => {
	if (import.meta.env.DEV || !crossSiteForm(event.request, event.url)) return resolve(event);
	const message = `Cross-site ${event.request.method} form submissions are forbidden`;
	return event.request.headers.get('accept') === 'application/json'
		? Response.json({ message }, { status: 403 })
		: new Response(message, { status: 403 });
};
