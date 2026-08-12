<script lang="ts">
	import Block from './Block.svelte';
	import Heading from './Heading.svelte';
	import type { Block as BlockType } from '$lib/types';

	/**
	 * The grid, shared by `/` and the editor preview — a preview rendered by
	 * different code than the page is not a preview.
	 *
	 * A `heading` is not a grid item. Every implicit row has a minimum height of
	 * one column unit (that unit is what makes a `1x1` actually square), so a
	 * heading placed *in* the grid reserved a full square row for two lines of
	 * type and left a void under every section title. It is a rule between
	 * grids, not a cell inside one — which is also what §7 means by "breaks the
	 * grid into labelled sections". So each heading starts a new section, and
	 * each section is its own grid.
	 */

	type Props = {
		blocks: BlockType[];
		live?: Record<string, { data: unknown }>;
		/** The one block allowed to load its image eagerly — the LCP candidate. */
		eagerId?: string;
	};

	let { blocks, live = {}, eagerId }: Props = $props();

	type Section = { key: string; heading: BlockType | null; blocks: BlockType[] };

	let sections = $derived.by(() => {
		const out: Section[] = [];
		let current: Section = { key: 'top', heading: null, blocks: [] };

		for (const block of blocks) {
			if (block.kind === 'heading') {
				if (current.heading || current.blocks.length) out.push(current);
				current = { key: block.id, heading: block, blocks: [] };
			} else {
				current.blocks.push(block);
			}
		}

		if (current.heading || current.blocks.length) out.push(current);
		return out;
	});
</script>

{#each sections as section, index (section.key)}
	{#if section.heading}
		<!-- Only the very first heading skips its top space; every other one is
		     ending a grid and needs to be clearly off it. -->
		<Heading data={section.heading.data as Record<string, string>} first={index === 0} />
	{/if}

	{#if section.blocks.length}
		<div class="bento-grid">
			{#each section.blocks as block (block.id)}
				<Block {block} live={live[block.id]?.data} eager={block.id === eagerId} />
			{/each}
		</div>
	{/if}
{/each}
