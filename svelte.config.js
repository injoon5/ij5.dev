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

		// SvelteKit owns the policy because it is the only thing that can
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
				// Turnstile (`$lib/server/turnstile`), loaded on the login page
				// only, and only when it is configured.
				'script-src': ['self', 'https://challenges.cloudflare.com'],
				'frame-src': ['https://challenges.cloudflare.com'],
				// SvelteKit inlines critical CSS, so styles need it. Scripts do not.
				'style-src': ['self', 'unsafe-inline'],
				// `https:` because the Markdown renderer accepts absolute external
				// image URLs (prose and gallery alike) — the renderer emits them,
				// so the policy must not block them.
				'img-src': ['self', 'https://assets.ij5.dev', 'data:', 'https:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'form-action': ['self'],
				'object-src': ['none']
			}
		},

		// SvelteKit's own cross-site form check runs before any hook, and it
		// refuses a form POST with no Origin header — which is exactly what
		// Cloudflare Access sends, server to server, to `/oauth/token`. So the
		// same check lives in `hooks.server.ts` instead, with that one endpoint
		// (which authenticates its caller with a client secret) exempt.
		csrf: {
			trustedOrigins: ['*']
		},

		version: {
			pollInterval: 0
		}
	}
};

export default config;
