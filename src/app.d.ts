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

				/** Live-widget credentials. Each is optional; a missing one makes
				 * that widget render its fallback rather than an error. */
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
