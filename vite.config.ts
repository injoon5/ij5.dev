import { sveltekit } from '@sveltejs/kit/vite';
import { sveltekitOG } from '@ethercorps/sveltekit-og/plugin';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * The build and tooling config. Everything Svelte-related lives in
 * `svelte.config.js` — passing options here instead makes SvelteKit ignore that
 * file entirely, which would silently drop the CSP configuration.
 *
 * The Cloudflare plugin is deliberately *not* here; it lives in
 * `vite.config.dev.ts`, which the dev script points at. See that file.
 */

/**
 * sveltekit-og bundles two resvg providers and picks one at runtime — the edge
 * provider in workerd, the Node one elsewhere. That Node provider imports
 * `node:module` and `node:fs/promises`; without a shim, rolldown hoists the
 * import into a statically-loaded chunk and every Worker request fails at
 * startup (the same imports are what `nodejs_compat` would let through, and
 * this project deliberately runs without it, §11). The shims satisfy the
 * bundle; the provider never executes on Cloudflare.
 */
const shim = (file: string) => fileURLToPath(new URL(`./shims/${file}`, import.meta.url));

/**
 * A build-time identifier baked into the bundle and folded into the homepage's
 * cache key and ETag (`hooks.server.ts`). A template or CSS edit does not bump
 * the published document version, so without this a deploy would sit behind
 * the last-published HTML at every colo with nothing able to purge it. Every
 * deploy instead changes the key — each colo misses at once — and the ETag, so
 * browsers refetch instead of 304ing. Rebuilding the same commit reuses the
 * same ID and the cache survives, which is correct: the code is identical.
 * Falls back to a timestamp outside a git checkout.
 *
 * An uncommitted tree is not "the same code", but HEAD is unchanged — a dirty
 * build keyed on the SHA alone would ship new HTML under the previous deploy's
 * key and the cache would keep serving stale markup. So a hash of the diff
 * rides along whenever the tree is dirty, and every dirty build gets its own
 * key whether or not it was committed.
 */
function buildId() {
	try {
		const head = execSync('git rev-parse --short HEAD', {
			stdio: ['ignore', 'pipe', 'ignore']
		}).toString().trim();
		const diff = execSync('git diff HEAD', {
			stdio: ['ignore', 'pipe', 'ignore']
		}).toString();
		if (!diff) return head;
		const diffHash = execSync('git hash-object --stdin', {
			input: diff,
			stdio: ['pipe', 'pipe', 'ignore']
		})
			.toString()
			.trim()
			.slice(0, 7);
		return `${head}-${diffHash}`;
	} catch {
		return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
	}
}

export default defineConfig({
	define: {
		'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId())
	},
	plugins: [tailwindcss(), sveltekit(), sveltekitOG()],
	resolve: {
		alias: {
			'node:module': shim('node-module.mjs'),
			'node:fs/promises': shim('node-fs-promises.mjs')
		}
	}
});
