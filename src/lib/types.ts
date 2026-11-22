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

/** A paste — plaintext served at `/p/{slug}` instead of a redirect. */
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

/** The largest file the no-JavaScript form post accepts. That path buffers the
 * whole form in the Worker (128 MB of memory, shared), so it stays small; the
 * normal path streams the file to R2 in parts and is limited only by
 * `$lib/uploads`. */
export const MAX_FORM_FILE_BYTES = 25 * 1024 * 1024;

/** A shared file — bytes in R2, this row as its catalog entry. */
export type FileRow = {
	slug: string;
	/** R2 object key (`dl/{slug}`). */
	key: string;
	/** Original filename, for display and `Content-Disposition`. */
	name: string;
	mime: string;
	bytes: number;
	created_at: number;
	expires_at: number | null;
	/** Incremented on every served download. */
	downloads: number;
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

/** The largest app source, in UTF-8 bytes. Shared by the admin editor's
 * counter and the API's 413, so the two can never disagree. A Kiln app is
 * one file and the prompt asks for ~600 lines; 256 KB is several times that. */
export const MAX_APP_BYTES = 256 * 1024;

/** The longest app name — the label under an icon on the phone. */
export const MAX_APP_NAME = 32;

/**
 * An app's tint is a name, not a hex code: the phone maps each one to the
 * matching system colour (`Color.red` and so on), which adapts to light and
 * dark mode where a fixed hex would not.
 */
export const TINTS = [
	'red',
	'orange',
	'yellow',
	'green',
	'mint',
	'teal',
	'cyan',
	'blue',
	'indigo',
	'purple',
	'pink',
	'brown',
	'gray'
] as const;
export type Tint = (typeof TINTS)[number];

/** What `/api/apps` lists — everything but the source, which the index never
 * reads. `version` is opaque to clients: compare it, never parse it. */
export type AppMeta = {
	slug: string;
	name: string;
	icon: string | null;
	tint: Tint;
	version: string;
	updated_at: number;
	/** There is an earlier version to go back to (`POST …/revert`). */
	revertible: boolean;
};

export type AppFull = AppMeta & { source: string };

/** Per-app data limits (`/api/apps/{slug}/data`). Sizes are UTF-8 bytes of the
 * stored JSON text. */
export const MAX_DATA_VALUE_BYTES = 64 * 1024;
export const MAX_DATA_KEYS = 1000;
export const MAX_DATA_APP_BYTES = 5 * 1024 * 1024;

/** 1–128 printable characters with no "/", so a key is always one URL path
 * segment. Control characters (C0, DEL, C1) are what "printable" rules out. */
export const DATA_KEY_PATTERN = /^[^\u0000-\u001f\u007f-\u009f/]{1,128}$/u;
