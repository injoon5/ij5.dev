import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/**
 * The dev server, and only the dev server.
 *
 * The Cloudflare plugin is not optional here (§2): without it `event.platform`
 * is undefined under `vite dev`, so every load falls through to its
 * no-bindings branch and the local site renders as an empty shell with no KV,
 * no D1 and no R2. Running the real workerd against local bindings is the only
 * way dev and production agree.
 *
 * It is a separate file rather than a branch inside `vite.config.ts` because
 * the plugin reads `wrangler.jsonc` and validates its `main` field, which
 * points at a build artifact (`.svelte-kit/cloudflare/_worker.js`). Anything
 * that resolves the Vite config therefore fails on a tree that has not been
 * built yet — and `svelte-check` resolves it as `command: 'serve'`, so a
 * command-based gate does not exclude it. That is exactly what a clean CI
 * checkout hit, while a local run passed on a stale artifact left behind by an
 * earlier build.
 *
 * Splitting the file makes the rule explicit instead of inferred: the dev
 * script asks for this config, and nothing else can pick it up by accident.
 */
export default defineConfig((env) =>
	mergeConfig(typeof base === 'function' ? base(env) : base, {
		plugins: [cloudflare()]
	})
);
