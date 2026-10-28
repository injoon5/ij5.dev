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
			authed: boolean;
			/**
			 * Set by the hook on `/` so the page load does not pay a second KV
			 * read for the document the hook just read to build the cache key.
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

				/** Required for `grass` — the contribution calendar is GraphQL-only
				 * and GitHub refuses anonymous GraphQL outright. */
				GITHUB_TOKEN?: string;

				/** The largest part of a file upload, in MiB — keep it under the
				 *  zone plan's request-body limit (`$lib/uploads`). Default 90. */
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
