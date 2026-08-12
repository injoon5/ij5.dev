import { sveltekit } from '@sveltejs/kit/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	// Everything Svelte-related lives in `svelte.config.js`. Passing options
	// here instead makes SvelteKit ignore that file entirely, which would
	// silently drop the CSP configuration.
	plugins: [
		tailwindcss(),
		sveltekit(),

		/*
		 * Dev only, and not optional there (§2): without it `event.platform` is
		 * undefined under `vite dev`, so every load falls through to its
		 * no-bindings branch and the local site renders as an empty shell with
		 * no KV, no D1 and no R2. Running the real workerd against local
		 * bindings is the only way dev and production agree.
		 *
		 * The production bundle stays with `adapter-cloudflare` alone. The
		 * plugin wants to own the worker entry at build time, which collides
		 * with the adapter's own `_worker.js` in `wrangler.jsonc`, and the
		 * adapter is what `wrangler deploy` expects to find.
		 */
		...(command === 'serve' ? [cloudflare()] : [])
	]
}));
