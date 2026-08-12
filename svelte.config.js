import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Runes everywhere in this project; libraries keep their own mode.
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	kit: {
		adapter: adapter(),

		// §13. SvelteKit owns the policy because it is the only thing that can
		// hash its own inline bootstrap script; reaching for 'unsafe-inline'
		// instead would defeat the directive entirely.
		//
		// `frame-ancestors` and `base-uri` are ignored when a policy is
		// delivered in a <meta> tag, so `hooks.server.ts` sends them as a
		// second, deliberately narrow policy header. Two policies are both
		// enforced, which is exactly what we want here.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// SvelteKit inlines critical CSS, so styles need it. Scripts do not.
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'https://assets.ij5.dev', 'data:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'form-action': ['self'],
				'object-src': ['none'],
				// Embeds are facades (§7): a poster until someone presses play,
				// at which point one iframe is injected. That injection needs a
				// frame-src entry, so the two providers the `video` widget can
				// build an embed URL for are listed explicitly. Never a
				// wildcard, and nothing else gets in.
				'frame-src': ['https://www.youtube-nocookie.com', 'https://player.vimeo.com']
			}
		},

		version: {
			pollInterval: 0
		}
	}
};

export default config;
