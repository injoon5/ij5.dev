<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<!-- Renders the offset, not the time. A ticking clock needs JavaScript, and a
     rendered time is wrong the moment the page is cached — which, given the
     version-keyed edge cache, is immediately. -->
<Surface {span}>
	<span class="text-2xs font-semibold tracking-wide text-text-subtle">Local time</span>
	<div class="mt-auto">
		<p class="text-xl font-semibold">{data.place}</p>
		<p class="tnum mt-0.5 text-xs text-text-muted">{data.offset}</p>
	</div>
</Surface>
