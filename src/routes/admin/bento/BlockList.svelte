<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { enhance } from '$app/forms';
	import GripVertical from 'lucide-svelte/icons/grip-vertical';
	import ArrowUp from 'lucide-svelte/icons/arrow-up';
	import ArrowDown from 'lucide-svelte/icons/arrow-down';
	import type { Snippet } from 'svelte';
	import type { Block } from '$lib/types';
	import { widgets, isKind } from '$lib/widgets/catalog';

	type Props = {
		blocks: Block[];
		selected: string | null;
		onSelect: (id: string) => void;
		detail: Snippet<[Block]>;
	};

	let { blocks, selected, onSelect, detail }: Props = $props();

	let items = $state<Block[]>([]);
	let dragging = $state(false);
	let submitEl = $state<HTMLFormElement | null>(null);
	let orderValue = $state('');

	$effect(() => {
		if (!dragging) items = blocks.map((b) => ({ ...b }));
	});

	const FLIP = 180;

	/**
	 * A press-and-hold delay on touch, so a flick down the list still scrolls
	 * the page instead of picking a row up. Movement before the hold elapses
	 * cancels the drag outright, which is the difference between drag-to-order
	 * being usable on a phone and being a trap.
	 *
	 * Drag is not gated behind the handle: the library already refuses to start
	 * a drag from a nested form control, so the inputs in an expanded row are
	 * safe, and gating on a handle press cannot work anyway — the listener is
	 * only attached on the next update, one press too late.
	 */
	const TOUCH_HOLD_MS = 250;

	function consider(event: CustomEvent<DndEvent<Block>>) {
		dragging = true;
		items = event.detail.items;
	}

	function finalize(event: CustomEvent<DndEvent<Block>>) {
		items = event.detail.items;
		dragging = false;
		commit(items.map((b) => b.id));
	}

	function move(index: number, delta: number) {
		const next = [...items];
		const target = index + delta;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target], next[index]];
		items = next;
		commit(next.map((b) => b.id));
	}

	function commit(ids: string[]) {
		orderValue = ids.join(',');
		// Submitting a real form keeps the reorder on the same code path as the
		// no-JavaScript buttons below.
		queueMicrotask(() => submitEl?.requestSubmit());
	}

	const label = (block: Block) => (isKind(block.kind) ? widgets[block.kind].label : block.kind);

	const summary = (block: Block) => {
		const d = block.data as Record<string, unknown>;
		const first = d.title ?? d.label ?? d.text ?? d.value ?? d.handle ?? d.quote ?? d.place ?? d.repo;
		return typeof first === 'string' && first ? first : '—';
	};
</script>

<form method="POST" action="?/reorder" bind:this={submitEl} use:enhance class="hidden">
	<input type="hidden" name="ids" value={orderValue} />
</form>

<ul
	class="flex flex-col gap-1.5"
	use:dndzone={{
		items,
		flipDurationMs: FLIP,
		delayTouchStart: TOUCH_HOLD_MS,
		dropTargetStyle: {}
	}}
	onconsider={consider}
	onfinalize={finalize}
>
	{#each items as block, index (block.id)}
		<li animate:flip={{ duration: FLIP }} class="block-row" class:selected={selected === block.id}>
			<div class="flex items-center gap-1 px-2">
				<!--
					A cue, not a control. Making it a `<button>` would stop drags
					starting here, because the library deliberately ignores
					mousedown on form controls. Reordering by keyboard is the two
					nudge buttons on the right, which also work with JS off.
				-->
				<span class="handle" aria-hidden="true">
					<GripVertical size={15} />
				</span>

				<button type="button" class="summary" onclick={() => onSelect(block.id)}>
					<!-- `ord` is the mobile order and the desktop grid diverges from
					     it, so the number is shown rather than implied. -->
					<span class="tnum ord">{index + 1}</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm font-medium">{summary(block)}</span>
						<span class="block text-xs text-text-subtle">{label(block)} · {block.span}</span>
					</span>
				</button>

				<div class="flex shrink-0">
					<button
						type="button"
						class="nudge"
						aria-label="Move up"
						disabled={index === 0}
						onclick={() => move(index, -1)}
					>
						<ArrowUp size={14} aria-hidden="true" />
					</button>
					<button
						type="button"
						class="nudge"
						aria-label="Move down"
						disabled={index === items.length - 1}
						onclick={() => move(index, 1)}
					>
						<ArrowDown size={14} aria-hidden="true" />
					</button>
				</div>
			</div>

			{#if selected === block.id}
				<!--
					The form opens inside the row it belongs to rather than in a
					separate pane. Selecting a block happens dozens of times in an
					editing session, so it does not animate: an entrance you see
					that often stops explaining anything and starts costing time.
				-->
				<div class="detail">
					{@render detail(block)}
				</div>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.block-row {
		border-radius: var(--radius-ui-lg);
		background-color: var(--surface);
		padding-block: 0.375rem;
		transition: box-shadow 150ms var(--ease-out);
	}

	.block-row.selected {
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.handle,
	.nudge {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		flex-shrink: 0;
		border-radius: var(--radius-ui-sm);
		color: var(--text-subtle);
		transition: color 150ms var(--ease-out), background-color 150ms var(--ease-out);
	}

	.handle {
		cursor: grab;
		touch-action: none;
	}

	.handle:active {
		cursor: grabbing;
	}

	.nudge:disabled {
		opacity: 0.3;
		pointer-events: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.handle:hover,
		.nudge:hover {
			background-color: var(--surface-sunken);
			color: var(--text);
		}

		.handle,
		.nudge {
			width: 2rem;
			height: 2rem;
		}
	}

	.summary {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.625rem;
		min-width: 0;
		min-height: 2.75rem;
		padding-inline: 0.25rem;
		text-align: start;
	}

	.ord {
		width: 1.25rem;
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--text-subtle);
		font-variant-numeric: tabular-nums;
	}

	.detail {
		margin-top: 0.5rem;
		border-top: 1px solid var(--border-subtle);
		padding: 1.25rem 1rem 0.75rem;
	}
</style>
