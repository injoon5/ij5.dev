import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// Everything Svelte-related lives in `svelte.config.js`. Passing options
	// here instead makes SvelteKit ignore that file entirely, which would
	// silently drop the CSP configuration.
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
