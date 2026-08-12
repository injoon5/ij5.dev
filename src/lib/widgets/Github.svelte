<script lang="ts">
	import Star from 'lucide-svelte/icons/star';
	import PlatformIcon from './PlatformIcon.svelte';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	type Live = { stars?: number; language?: string; description?: string };

	let {
		span,
		data,
		live
	}: { span: Span; data: Record<string, string>; live?: Live } = $props();

	// Every live widget declares a fallback. If the API is down or the token
	// expired the widget renders that instead, and looks intentional. A live
	// widget that can break the page is not worth having.
	let value = $derived(
		live?.stars !== undefined ? new Intl.NumberFormat('en').format(live.stars) : data.fallbackValue
	);
	let label = $derived(live?.language ?? data.fallbackLabel ?? `${data.owner}/${data.repo}`);
</script>

<Surface {span} href="https://github.com/{data.owner}/{data.repo}">
	<div class="flex items-start justify-between">
		<PlatformIcon name="github" size={22} class="text-text" />
		{#if value}
			<span class="flex items-center gap-1 text-xs text-text-subtle">
				<Star size={13} aria-hidden="true" />
				<span class="tnum">{value}</span>
			</span>
		{/if}
	</div>

	<div class="mt-auto pt-3">
		<p class="truncate text-base font-semibold">{data.repo}</p>
		<p class="mt-0.5 truncate text-xs text-text-muted">{label}</p>
	</div>
</Surface>
