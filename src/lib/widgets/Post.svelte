<script lang="ts">
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	type Live = { title?: string; url?: string; at?: string };

	let {
		span,
		data,
		live
	}: { span: Span; data: Record<string, string>; live?: Live } = $props();

	let title = $derived(live?.title || data.fallbackTitle);
	let href = $derived(live?.url || data.url || undefined);

	// The feed's own date string, formatted here rather than trusted as-is —
	// RSS and Atom disagree about the format and neither is presentable.
	let when = $derived.by(() => {
		if (!live?.at) return '';
		const date = new Date(live.at);
		return Number.isNaN(date.getTime())
			? ''
			: new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
					date
				);
	});
</script>

<Surface {span} href={href} flexible>
	<div class="flex items-start justify-between gap-3">
		<span class="text-2xs font-semibold text-text-subtle">{data.label || 'Latest post'}</span>
		{#if href}
			<ArrowUpRight size={15} class="shrink-0 text-text-subtle" aria-hidden="true" />
		{/if}
	</div>

	<div class="mt-auto pt-3">
		<p class="line-clamp-3 text-base leading-[1.4] font-semibold text-balance">
			{title || 'Nothing published yet'}
		</p>
		{#if when}
			<p class="tnum mt-1 text-xs text-text-muted">{when}</p>
		{/if}
	</div>
</Surface>
