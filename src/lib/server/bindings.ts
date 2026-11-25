import { error } from '@sveltejs/kit';

export type Env = App.Platform['env'];

/**
 * The Worker's bindings. They are always there — in production, and under
 * `vite dev`, which runs workerd through the Cloudflare plugin — so their
 * absence is a broken deployment, answered with one 503 here instead of a
 * fallback in every route.
 */
export function bindings(platform: App.Platform | undefined): Env {
	if (!platform?.env) error(503, 'No platform bindings.');
	return platform.env;
}

/**
 * Work that finishes after the response: counters, cache fills, refreshes.
 * A failure is logged (Workers observability keeps it), never thrown at the
 * visitor.
 */
export function afterResponse(platform: App.Platform | undefined, work: Promise<unknown>) {
	platform?.context?.waitUntil?.(work.catch((e) => console.error('background work failed:', e)));
}
