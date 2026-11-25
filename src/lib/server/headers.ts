import type { Handle } from '@sveltejs/kit';

/**
 * A second, deliberately narrow CSP. `frame-ancestors` and `base-uri` are
 * ignored inside a <meta> tag, which is how SvelteKit may deliver the main
 * policy from `svelte.config.js`; both policies are enforced.
 */
const SECURITY_HEADERS: Array<[string, string]> = [
	['Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'"],
	['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
	['X-Content-Type-Options', 'nosniff'],
	// Still sends the origin cross-site, which the hostname-only referrer
	// counts in analytics need.
	['Referrer-Policy', 'strict-origin-when-cross-origin'],
	['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()']
];

export const securityHeaders: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	for (const [k, v] of SECURITY_HEADERS) res.headers.set(k, v);
	return res;
};
