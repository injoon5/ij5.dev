export type ProfileLink = {
	label: string;
	href: string;
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

/** `markdown` mirrors `profile.content` at the top level so the published doc
 * is self-describing without reaching through the profile. */
export type HomeDoc = {
	v: number;
	profile: Profile;
	markdown: string;
};

export type LiveDoc = Record<string, { at: number; data: unknown }>;

/**
 * `id` is its sub-key in the `live` document, `kind` the fetcher to run.
 * Declared here (not in `live.server.ts`) so the client-safe Markdown module
 * can reference the type without importing server-only code.
 */
export type LiveRequest = { id: string; kind: string; data: Record<string, unknown> };

/** The contribution graph's live source. */
export const GRASS = 'grass';

export type AssetRow = {
	key: string;
	mime: string;
	bytes: number;
	w: number | null;
	h: number | null;
	at: number;
};

export const HOME_KEYS = { published: 'home', draft: 'home:draft', previous: 'home:prev' } as const;

export const EMPTY_PROFILE: Profile = {
	name: 'ij5',
	bio: null,
	tagline: null,
	avatar: null,
	links: [],
	content: null
};
