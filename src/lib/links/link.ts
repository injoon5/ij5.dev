/**
 * Short links: D1 `slugs` is the source of truth, KV `slug:{slug}` is what
 * `redirect.server.ts` reads, and the edge cache holds each redirect for
 * `REDIRECT_TTL` seconds. Kept free of heavy imports: the hook loads it on
 * every request.
 */

/** The KV value behind a link — read on every uncached redirect, so tiny. */
export type SlugRecord = {
	target: string;
	status: number;
	/** Epoch ms; judged on read. */
	exp: number | null;
};

export type SlugRow = {
	slug: string;
	target_url: string;
	status: number;
	note: string | null;
	created_at: number;
	expires_at: number | null;
};

export type LinkInput = Omit<SlugRow, 'created_at'>;

export const REDIRECT_TTL = 300;
export const NOTE_MAX = 200;

export const kvKey = (slug: string) => `slug:${slug}`;

/** Query-independent, so `/gh?utm_source=x` and `/gh` share one entry. */
export const redirectCacheKey = (slug: string) => new Request(`https://cache.internal/s/${slug}`);

export const toRecord = (row: LinkInput): SlugRecord => ({
	target: row.target_url,
	status: row.status,
	exp: row.expires_at
});

/**
 * Schemes a link may point at. A short link is only ever a `Location:` header,
 * so `mailto:` and friends are legitimate — but the allow-list keeps
 * `javascript:`, `data:` and anything else that turns a redirect into a
 * payload out.
 */
const TARGET_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'sms']);
export const TARGET_MESSAGE = 'Use a full URL, starting with https://, mailto:, tel: or sms:';

export function isTargetUrl(value: string): boolean {
	try {
		return TARGET_SCHEMES.has(new URL(value).protocol.slice(0, -1));
	} catch {
		return false;
	}
}

/** The shape the links API answers with. */
export const linkJson = (row: SlugRow) => ({
	slug: row.slug,
	url: row.target_url,
	status: row.status,
	note: row.note,
	created_at: row.created_at,
	expires_at: row.expires_at
});
