import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * The build and tooling config. Everything Svelte-related lives in
 * `svelte.config.js` — passing options here instead makes SvelteKit ignore that
 * file entirely, which would silently drop the CSP configuration.
 *
 * The Cloudflare plugin is deliberately *not* here; it lives in
 * `vite.config.dev.ts`, which the dev script points at. See that file.
 */
export default defineConfig({
	plugins: [tailwindcss(), sveltekit()]
});
