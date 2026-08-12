<script lang="ts">
	import { getContext } from 'svelte';

	type Props = {
		src: string;
		alt: string;
		/** Reserved dimensions. Missing values fall back to the span ratio, so
		 * nothing shifts either way. */
		width?: number;
		height?: number;
		eager?: boolean;
		class?: string;
	};

	let { src, alt, width, height, eager = false, class: extra = '' }: Props = $props();

	// R2 is bound to a custom domain, so these requests never touch the Worker
	// and the egress is free.
	const origin = getContext<string>('assetsOrigin') ?? '';
	let url = $derived(/^https?:\/\//.test(src) ? src : `${origin}/${src}`);
</script>

<img
	src={url}
	{alt}
	{width}
	{height}
	loading={eager ? 'eager' : 'lazy'}
	decoding={eager ? 'sync' : 'async'}
	fetchpriority={eager ? 'high' : 'auto'}
	class="h-full w-full object-cover {extra}"
/>

<!--
	A failed load is handled by the delegated listener in `/w.js`, not an inline
	`onerror` attribute: inline handlers need `unsafe-hashes` in the CSP, and
	loosening the policy for one error case is not a trade worth making.
-->

