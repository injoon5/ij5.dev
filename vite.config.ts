import { sveltekit } from '@sveltejs/kit/vite';
import { sveltekitOG } from '@ethercorps/sveltekit-og/plugin';
import tailwindcss from '@tailwindcss/vite';
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

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), sveltekitOG()],
	resolve: {
		alias: {
			'node:module': shim('node-module.mjs'),
			'node:fs/promises': shim('node-fs-promises.mjs')
		}
	}
});
