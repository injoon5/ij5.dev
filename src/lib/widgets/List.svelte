<script lang="ts">
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	type Item = { label: string; href?: string; meta?: string };

	let { span, data }: { span: Span; data: { title?: string; items: Item[] } } = $props();
</script>

<Surface {span} flexible>
	{#if data.title}
		<p class="text-2xs font-semibold tracking-wide text-text-subtle">{data.title}</p>
	{/if}

	<ul class="-mx-2 mt-3 flex flex-col">
		{#each data.items as item (item.label)}
			<li>
				<svelte:element
					this={item.href ? 'a' : 'div'}
					href={item.href}
					class="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 ease-out hover:bg-surface-sunken"
				>
					<span class="min-w-0 flex-1 truncate text-sm">{item.label}</span>
					{#if item.meta}
						<span class="tnum shrink-0 text-xs text-text-subtle">{item.meta}</span>
					{/if}
					{#if item.href}
						<ArrowUpRight size={14} class="shrink-0 text-text-subtle" aria-hidden="true" />
					{/if}
				</svelte:element>
			</li>
		{/each}
	</ul>
</Surface>
