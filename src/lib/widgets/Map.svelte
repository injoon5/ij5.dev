<script lang="ts">
	import Asset from './Asset.svelte';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<!-- A static tile, never an interactive map: an embed would cost hundreds of
     kilobytes and a script-src exception for a widget nobody pans. -->
<Surface {span} bleed>
	<div class="absolute inset-0">
		<Asset src={data.src} alt={data.alt || `Map of ${data.label}`} />
	</div>
	<!-- Metadata rides in a capsule, inset from the edge by the widget padding.
	     That inset is most of what makes an overlay read as native. -->
	<div class="relative mt-auto p-widget">
		<span class="capsule">{data.label}</span>
	</div>
</Surface>
