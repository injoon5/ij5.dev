<script lang="ts">
	import PlatformIcon from './PlatformIcon.svelte';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	let { span, data }: { span: Span; data: Record<string, string> } = $props();
</script>

<Surface {span} href={data.url}>
	<PlatformIcon name={data.platform} size={22} class="text-text" />

	<div class="mt-auto pt-3">
		<p class="truncate text-base font-semibold">{data.handle}</p>
		<p class="mt-0.5 text-xs text-text-muted">
			{#if data.count}<span class="tnum">{data.count}</span> followers{:else}Follow{/if}
		</p>
	</div>
</Surface>
