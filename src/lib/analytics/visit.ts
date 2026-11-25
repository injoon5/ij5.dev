/** What a counted request was. */
export type Kind = 'redirect' | 'paste' | 'home' | '404';

/** The homepage's row in `hits` and `visitors`. */
export const HOME_SLUG = '';

/** The bucket for 404 paths that could never be a slug, and every bot's 404. */
export const OTHER_PATH = '*';

/** Country when Cloudflare cannot tell. */
export const UNKNOWN_COUNTRY = 'XX';

/** The public path a row in `hits` counts. */
export const visitPath = (kind: string, slug: string) =>
	kind === 'home' ? '/' : kind === 'paste' ? `/p/${slug}` : `/${slug}`;
