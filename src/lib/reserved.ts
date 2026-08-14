/**
 * Paths a slug may never shadow. Shared between the hook (which skips the KV
 * read for them) and slug creation (which rejects them), so the two can never
 * drift apart.
 *
 * `login` is on the list because `/login` is a real route — omitting it lets a
 * slug shadow the sign-in page. `analytics` guards `/analytics/beacon`, the
 * fingerprint endpoint, the same way.
 */
export const RESERVED = new Set([
	'admin',
	'analytics',
	'api',
	'login',
	'logout',
	'_app',
	'.well-known'
]);

/**
 * The same three guards the hook applies, in one place: single segment, no
 * dot, not reserved. A dot-free check is what keeps `robots.txt`, `og.png` and
 * every other static asset from costing a pointless KV read.
 */
export function isSlugCandidate(seg: string): boolean {
	return Boolean(seg) && !seg.includes('/') && !seg.includes('.') && !RESERVED.has(seg);
}

/** Slugs are the URL, so keep them to characters that survive one unedited. */
export const SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
