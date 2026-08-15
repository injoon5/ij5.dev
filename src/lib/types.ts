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

/** Maximum characters a paste body will accept — shared by the admin form,
 * the server-side validation and the KV mirror, so the UI count and the
 * rejection can never drift. Big enough for logs, small enough that a browser
 * renders it in one `<pre>` without hanging. */
export const MAX_PASTE_CHARS = 250_000;

/** A paste — plaintext served at a root slug instead of a redirect. */
export type PasteRow = {
	slug: string;
	body: string;
	note: string | null;
	created_at: number;
	expires_at: number | null;
	/** Opt-out of edge caching. A `false` paste is served `no-store` and never
	 *  fills the Cache API, so edits show up on the next request everywhere. */
	cache: boolean;
};

/** The KV value behind `paste:{slug}`, read on every uncached paste view.
 * `body` is what the hook serves; the metadata lets the view render a header
 * without a second read. */
export type PasteRecord = {
	body: string;
	note: string | null;
	created_at: number;
	/** Epoch ms. Expiry is lazy, same as `SlugRecord.exp`. */
	exp: number | null;
	cache: boolean;
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
	/** The homepage body, authored as Markdown. Rendered to HTML at request time. */
	content: string | null;
};

/** The published document in KV. `v` is bumped on publish and is what makes
 * the edge cache key change everywhere at once. The homepage body lives on
 * `profile.content`; `markdown` mirrors it at the top level so the published
 * doc is self-describing without reaching through the profile. */
export type HomeDoc = {
	v: number;
	profile: Profile;
	markdown: string;
};

/**
 * All live data under one key. Per-source keys would cost one KV read each on
 * every render; the price of sharing is last-write-wins, which at this scale
 * means a source occasionally waits one more TTL.
 */
export type LiveDoc = Record<string, { at: number; data: unknown }>;

/**
 * A request for one live source: a stable `id` (its KV sub-key), a `kind` (the
 * fetcher to run), and the `data` that fetcher needs. The Markdown renderer
 * discovers these from the shortcodes in a document; the server refreshes them.
 * Declared here (not in `server/live.ts`) so the client-safe Markdown module can
 * reference the type without importing server-only code.
 */
export type LiveRequest = { id: string; kind: string; data: Record<string, unknown> };

export type AssetRow = {
	key: string;
	mime: string;
	bytes: number;
	w: number | null;
	h: number | null;
	at: number;
};
