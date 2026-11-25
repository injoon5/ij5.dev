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

/** What an app without a tint gets. */
export const DEFAULT_TINT: Tint = 'blue';

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Sources are stored with "\n" line endings only, so a version never depends
 * on whether a browser textarea, a Windows tool or curl sent the file. A
 * leading BOM goes too.
 */
export const normalizeSource = (s: string) => s.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

export const SOURCE_TOO_BIG = `Keep the source under ${MAX_APP_BYTES / 1024} KB.`;

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
