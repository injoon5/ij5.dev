<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// iOS Safari only applies `:active` once something on the page listens
	// for touches. Without this every press state — the 0.96 scale, the row
	// tint — is dead on an iPhone. Passive, and it does nothing else.
	$effect(() => {
		const noop = () => {};
		document.addEventListener('touchstart', noop, { passive: true });
		return () => document.removeEventListener('touchstart', noop);
	});
</script>

{@render children()}
