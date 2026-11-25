import type { KVNamespace, D1Database, R2Bucket, ExecutionContext } from '@cloudflare/workers-types';

declare global {
	/** Workers runtime: an identity stream of a declared length, so a body of
	 *  known size can be handed on (to R2) without being buffered. */
	// eslint-disable-next-line no-var
	var FixedLengthStream: {
		new (length: number | bigint): TransformStream<Uint8Array, Uint8Array>;
	};

	namespace App {
		interface Locals {
			/** The signed-in session, if the cookie names a live one. */
			session: import('$lib/auth/sessions.server').SessionRow | null;
			/** `session !== null`, set alongside it by the session hook. */
			authed: boolean;
			/**
			 * Set by `serveHome` (`$lib/home/cache.server`) on `/` so the page load
			 * does not pay a second KV read for the document it just read to build
			 * the cache key.
			 */
			home?: import('$lib/types').HomeDoc | null;
		}

		interface Platform {
			env: {
				KV: KVNamespace;
				DB: D1Database;
				BUCKET: R2Bucket;

				/** base64(SHA-256(token)) — the token itself is never stored. */
				AUTH_HASH: string;
				/** 32 random bytes, base64. Signs puzzle grids. Sessions live in D1. */
				SESSION_SECRET: string;

				/**
				 * Password + puzzle sign-in. All three, or the door stays
				 * closed. Generate with `node scripts/auth.mjs password`.
				 */
				/** PHC string: `$argon2id$v=19$m=…,t=…,p=1$salt$hash`. */
				PASSWORD_HASH?: string;
				/** Argon2's secret input. Without it the hash cannot be cracked offline. */
				PASSWORD_PEPPER?: string;
				/** The route through the 4×4 grid, e.g. `A1 B2 C3 C4`. */
				PUZZLE_PATH?: string;

				/** Optional: an ntfy topic URL (or any POST endpoint) for sign-in alerts. */
				ALERT_URL?: string;
				/** Optional: Turnstile in front of the password doors. Both or neither. */
				TURNSTILE_SITE_KEY?: string;
				TURNSTILE_SECRET?: string;

				/** OpenID Connect for Cloudflare Access (`$lib/auth/oidc.server`). */
				OIDC_CLIENT_ID?: string;
				OIDC_REDIRECT_URI?: string;
				/** base64(SHA-256(client secret)). */
				OIDC_CLIENT_SECRET_HASH?: string;
				/** Private RSA JWK with a `kid`. `node scripts/auth.mjs oidc-key`. */
				OIDC_PRIVATE_JWK?: string;
				/** The `email` claim — what Access policies match on. */
				OIDC_EMAIL?: string;
				OIDC_NAME?: string;
				/** 32 random bytes, base64. Visitor hashing. */
				SALT: string;

				PUBLIC_ORIGIN: string;
				ASSETS_ORIGIN: string;

				/**
				 * Live-widget credentials. Every one is optional, and a widget
				 * whose credential is absent is *disabled* rather than broken: its
				 * fetcher's `available` check (`$lib/home/live.server`) refuses to
				 * schedule it, no request is made,
				 * and the widget renders the fallback it declares. The site runs
				 * with none of these set.
				 */

				/** Required for `grass` — the contribution calendar is GraphQL-only
				 * and GitHub refuses anonymous GraphQL outright. */
				GITHUB_TOKEN?: string;

				/** The largest part of a file upload, in MiB — keep it under the
				 *  zone plan's request-body limit (`$lib/files/uploads`). Default 90. */
				UPLOAD_PART_MIB?: string;

			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
			cf?: IncomingRequestCfProperties;
		}

		interface Error {
			code?: string;
		}
	}
}

export {};
