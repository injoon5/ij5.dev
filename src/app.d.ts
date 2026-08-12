import type { KVNamespace, D1Database, R2Bucket, ExecutionContext } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Locals {
			authed: boolean;
			/**
			 * Set by the hook on `/` so the page load does not pay a second KV
			 * read for the document the hook just read to build the cache key.
			 */
			bento?: import('$lib/types').BentoDoc | null;
		}

		interface Platform {
			env: {
				KV: KVNamespace;
				DB: D1Database;
				BUCKET: R2Bucket;

				/** base64(SHA-256(token)) — the token itself is never stored. */
				AUTH_HASH: string;
				/** 32 random bytes, base64. Rotate to revoke every session. */
				SESSION_SECRET: string;
				/** 32 random bytes, base64. Visitor hashing (§6). */
				SALT: string;

				PUBLIC_ORIGIN: string;
				ASSETS_ORIGIN: string;

				/**
				 * Live-widget credentials. Every one is optional, and a widget
				 * whose credential is absent is *disabled* rather than broken:
				 * `isLiveAvailable` refuses to schedule it, no request is made,
				 * and the widget renders the fallback it declares. The site runs
				 * with none of these set.
				 */

				/** Optional for `github` (raises the rate limit), required for
				 * `grass` — the contribution calendar is GraphQL-only and GitHub
				 * refuses anonymous GraphQL outright. */
				GITHUB_TOKEN?: string;

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
