// Build-time stand-in for `node:module`, which Vite's SSR build has no business
// bundling for a Workers target. The only importer is sveltekit-og's Node resvg
// provider (`providers/resvg/node.js`); the edge provider is chosen at runtime
// in workerd, so this module never executes there. Without the alias its
// `createRequire` import gets hoisted into a statically-loaded chunk and the
// Worker fails at startup with "No such module node:module". Throwing here
// sends the provider's `try/catch` down its fetch-from-CDN fallback, which is
// exactly the behaviour that stub would replace on the one path that uses it.
export function createRequire() {
	throw new Error('node:module is not available in the Workers runtime');
}
