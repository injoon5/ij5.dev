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
