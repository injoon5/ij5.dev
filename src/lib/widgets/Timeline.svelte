<script lang="ts">
	import Surface from './Surface.svelte';
	import type { Span } from '$lib/types';

	type Item = { label: string; href?: string; meta?: string };

	let { span, data }: { span: Span; data: { title?: string; items: Item[] } } = $props();
</script>

<Surface {span} flexible>
	{#if data.title}
		<p class="text-2xs font-semibold text-text-subtle">{data.title}</p>
	{/if}

	<ol class="mt-3 flex flex-col gap-3">
		{#each data.items as item (item.label)}
			<li class="flex items-baseline justify-between gap-4">
				<span class="min-w-0 text-sm">
					{#if item.href}
						<a href={item.href} class="hover:text-accent">{item.label}</a>
					{:else}
						{item.label}
					{/if}
				</span>
				{#if item.meta}
					<span class="tnum shrink-0 text-xs text-text-subtle">{item.meta}</span>
				{/if}
			</li>
		{/each}
	</ol>
</Surface>
