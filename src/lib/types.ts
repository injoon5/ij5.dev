export type Span = '1x1' | '2x1' | '2x2' | 'full';

export const SPANS: Span[] = ['1x1', '2x1', '2x2', 'full'];

/** The KV value behind `slug:{slug}`. Deliberately tiny — it is read on every
 * uncached redirect and nothing else. */
export type SlugRecord = {
	target: string;
	status?: number;
	/** Epoch ms. Expiry is lazy: the hook compares this to `Date.now()`. */
	exp?: number | null;
};

export type SlugRow = {
	slug: string;
	target_url: string;
	status: number;
	note: string | null;
	created_at: number;
	expires_at: number | null;
};

export type ProfileLink = {
	label: string;
	href: string;
	/** Lucide icon name, resolved through a fixed allowlist at render time. */
	icon: string;
};

export type Profile = {
	name: string;
	bio: string | null;
	tagline: string | null;
	avatar: string | null;
	links: ProfileLink[];
};

export type Block = {
	id: string;
	ord: number;
	kind: string;
	span: Span;
	data: Record<string, unknown>;
};

/** The published document in KV. `v` is bumped on publish and is what makes
 * the edge cache key change everywhere at once. */
export type BentoDoc = {
	v: number;
	profile: Profile;
	blocks: Block[];
};

/**
 * All live-widget data under one key. Per-widget keys would cost one KV read
 * per widget on every render; the price of sharing is last-write-wins, which
 * at this scale means a widget occasionally waits one more TTL.
 */
export type LiveDoc = Record<string, { at: number; data: unknown }>;

export type AssetRow = {
	key: string;
	mime: string;
	bytes: number;
	w: number | null;
	h: number | null;
	at: number;
};
