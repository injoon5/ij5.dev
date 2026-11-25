/**
 * The root namespace: `ij5.dev/{slug}` is a link, a paste (`/p/{slug}`) or a
 * file (`/d/{slug}`), and one name means one thing wherever it is typed.
 */

/** Slugs are the URL, so keep them to characters that survive one unedited. */
export const SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
export const SLUG_MESSAGE = 'Use 1–64 letters, numbers, hyphens and underscores, starting with a letter or number.';

/**
 * Names a slug may never take. Every top-level route is here, so a link can
 * never shadow a page. `new` is what the admin lists use for "create" in
 * `?s=new`, so an item called `new` could never be opened.
 */
export const RESERVED = new Set([
	'admin',
	'analytics',
	'api',
	'login',
	'logout',
	'oauth',
	'p',
	'd',
	'raw',
	'_app',
	'new'
]);

/**
 * Whether a path segment could be a link: what the hook checks before
 * spending a KV read. No dot, so `robots.txt`, `og.png` and every other static
 * file skip it.
 */
export function isSlugCandidate(seg: string): boolean {
	return Boolean(seg) && !seg.includes('/') && !seg.includes('.') && !RESERVED.has(seg);
}

/** Why a slug cannot be used, before asking whether it is free. */
export function slugFormatProblem(slug: string): string | undefined {
	if (!SLUG_PATTERN.test(slug)) return SLUG_MESSAGE;
	if (RESERVED.has(slug)) return `"${slug}" is reserved by the site itself.`;
}
