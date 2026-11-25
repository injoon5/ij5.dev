import { sequence } from '@sveltejs/kit/hooks';
import { authenticate } from '$lib/auth/session.handle.server';
import { serveHome } from '$lib/home/cache.server';
import { serveRedirect } from '$lib/links/redirect.server';
import { rejectCrossSiteForms } from '$lib/server/csrf';
import { securityHeaders } from '$lib/server/headers';

/**
 * In order: refuse cross-site form posts; answer `/{slug}` redirects before
 * SvelteKit routes anything; serve the cached homepage; read the session.
 * Redirects skip the security headers (a cached response's headers are
 * immutable, and a 302 has no document to protect).
 *
 * Everything imported here is evaluated on every request, redirects included,
 * so these modules keep their imports small.
 */
export const handle = sequence(rejectCrossSiteForms, serveRedirect, securityHeaders, serveHome, authenticate);
