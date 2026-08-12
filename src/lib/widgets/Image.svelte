<script lang="ts">
	import Asset from './Asset.svelte';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let {
		span,
		data,
		eager = false
	}: { span: Span; data: Record<string, string>; eager?: boolean } = $props();
</script>

<Surface {span} href={data.href} bleed label={data.href ? data.alt : undefined}>
	<div class="absolute inset-0">
		<Asset src={data.src} alt={data.alt} {eager} />
	</div>
	{#if data.caption}
		<div class="widget-scrim relative mt-auto flex p-widget">
			<p class="text-sm font-medium text-white">{data.caption}</p>
		</div>
	{/if}
</Surface>
