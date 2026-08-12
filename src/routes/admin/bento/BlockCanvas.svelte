<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import ArrowUp from 'lucide-svelte/icons/arrow-up';
	import ArrowDown from 'lucide-svelte/icons/arrow-down';
	import Block from '$lib/widgets/Block.svelte';
	import Heading from '$lib/widgets/Heading.svelte';
	import { defFor, isKind, widgets } from '$lib/widgets/catalog';
	import type { Block as BlockType, Span } from '$lib/types';

	/**
	 * The editor canvas: the page itself, made editable.
	 *
	 * This renders exactly what `BentoGrid` renders — same components, same
	 * sectioning, same spans — with an interaction layer over it. Editing the
	 * real thing rather than a list beside a preview is the whole point: the
	 * block you are dragging is the block, at the size it will actually be.
	 *
	 * Blocks drag between sections as well as within them: the zones share a
	 * `type`, so a card can be pulled from Writing into Work and the order comes
	 * back out flattened in reading order.
	 */

	type Props = {
		blocks: BlockType[];
		selected: string | null;
		onSelect: (id: string, from: HTMLElement) => void;
		onReorder: (ids: string[]) => void;
	};

	let { blocks, selected, onSelect, onReorder }: Props = $props();

	const FLIP = 200;

	/**
	 * A press-and-hold before a drag begins, so a flick down the canvas still
	 * scrolls the page. Without it the first touch on any card captures the
	 * gesture and the page becomes unscrollable on a phone.
	 */
	const TOUCH_HOLD_MS = 220;

	type Section = { key: string; heading: BlockType | null; items: BlockType[] };

	// Local copy, because dnd-action mutates the array it is given as the drag
	// moves. It is resynced from the server's order whenever a drag is not in
	// flight — mid-drag it would yank the card out from under the finger.
	let sections = $state<Section[]>([]);
	let dragging = $state(false);

	function split(list: BlockType[]): Section[] {
		const out: Section[] = [];
		let current: Section = { key: '§top', heading: null, items: [] };

		for (const block of list) {
			if (block.kind === 'heading') {
				if (current.heading || current.items.length) out.push(current);
				current = { key: block.id, heading: block, items: [] };
			} else {
				current.items.push({ ...block });
			}
		}

		if (current.heading || current.items.length) out.push(current);
		// An empty trailing section still needs a drop target, or a grid emptied
		// by dragging its last card away can never receive one back.
		return out.length ? out : [{ key: '§top', heading: null, items: [] }];
	}

	$effect(() => {
		if (!dragging) sections = split(blocks);
	});

	/** Flattened back to reading order: each heading, then the cards under it. */
	function flatten(): string[] {
		return sections.flatMap((s) => [
			...(s.heading ? [s.heading.id] : []),
			...s.items.map((b) => b.id)
		]);
	}

	function consider(index: number, event: CustomEvent<DndEvent<BlockType>>) {
		dragging = true;
		sections[index].items = event.detail.items;
	}

	function finalize(index: number, event: CustomEvent<DndEvent<BlockType>>) {
		sections[index].items = event.detail.items;
		dragging = false;
		onReorder(flatten());
	}

	/**
	 * Keyboard and no-JavaScript reordering. Drag is the fast path, not the only
	 * path — the same rule as hover on touch.
	 */
	function nudge(id: string, delta: number) {
		const order = flatten();
		const at = order.indexOf(id);
		const to = at + delta;
		if (at < 0 || to < 0 || to >= order.length) return;
		[order[at], order[to]] = [order[to], order[at]];
		onReorder(order);
	}

	const SPAN_CLASS: Record<Span, string> = {
		'1x1': 'col-span-1',
		'2x1': 'col-span-2',
		'2x2': 'col-span-2 row-span-2',
		full: 'col-span-2 lg:col-span-4'
	};

	const spanClass = (block: BlockType) =>
		isKind(block.kind) && defFor(block.kind).flexible && block.span === '2x2'
			? 'col-span-2'
			: SPAN_CLASS[block.span];

	const label = (block: BlockType) =>
		isKind(block.kind) ? widgets[block.kind].label : block.kind;

	/**
	 * Press-to-open lives on the card itself rather than on a button covering
	 * it. A full-bleed `<button>` reads well but swallows the gesture: the drag
	 * library ignores presses that start on a form control — deliberately, so
	 * inputs inside a draggable item still work — so a card with a button over
	 * it could be pressed and never dragged.
	 *
	 * A drag and a press both begin with a pointer going down, so they are told
	 * apart by distance, not by timing: past a few pixels the intent was to
	 * move the card, and the press is dropped.
	 */
	const PRESS_SLOP = 6;
	let pressAt: { x: number; y: number } | null = null;

	function pressStart(event: PointerEvent) {
		pressAt = { x: event.clientX, y: event.clientY };
	}

	function pressEnd(id: string, event: PointerEvent & { currentTarget: HTMLElement }) {
		const from = pressAt;
		pressAt = null;
		if (!from) return;
		if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > PRESS_SLOP) return;
		onSelect(id, event.currentTarget);
	}

	let order = $derived(flatten());
</script>

{#each sections as section, index (section.key)}
	{#if section.heading}
		{@const heading = section.heading}
		<div class="canvas-heading">
			<Heading data={heading.data as Record<string, string>} first={index === 0} />
			<div class="heading-tools">
				<button
					type="button"
					class="chip"
					onclick={(e) => onSelect(heading.id, e.currentTarget)}
					aria-label="Edit section heading"
				>
					Edit
				</button>
				<button type="button" class="nudge" aria-label="Move heading up" onclick={() => nudge(heading.id, -1)}>
					<ArrowUp size={13} aria-hidden="true" />
				</button>
				<button type="button" class="nudge" aria-label="Move heading down" onclick={() => nudge(heading.id, 1)}>
					<ArrowDown size={13} aria-hidden="true" />
				</button>
			</div>
		</div>
	{/if}

	<div
		class="bento-grid canvas-grid"
		class:is-empty={section.items.length === 0}
		use:dndzone={{
			items: section.items,
			// One type across every section, which is what lets a card move from
			// one heading to another instead of only within its own.
			type: 'bento-block',
			flipDurationMs: FLIP,
			delayTouchStart: TOUCH_HOLD_MS,
			dropTargetStyle: {}
		}}
		onconsider={(e) => consider(index, e)}
		onfinalize={(e) => finalize(index, e)}
	>
		{#each section.items as block (block.id)}
			<div
				class="canvas-item {spanClass(block)}"
				class:is-selected={selected === block.id}
				animate:flip={{ duration: FLIP }}
				onpointerdown={pressStart}
				onpointerup={(e) => pressEnd(block.id, e)}
				role="group"
				aria-label="{label(block)} block, position {order.indexOf(block.id) + 1} of {order.length}"
			>
				<!--
					The real widget, inert. Its own links and buttons would otherwise
					swallow the press that is meant to select it, and a card that
					navigates away mid-edit is the fastest way to lose work.
				-->
				<div class="canvas-widget" aria-hidden="true">
					<Block {block} onInvalid="placeholder" />
				</div>

				<!--
					Visible on hover, and on focus for anyone arriving by keyboard —
					nothing important lives behind hover alone. `Edit` is also the
					keyboard route into a block, since the press handler above is a
					pointer gesture and the card itself belongs to the drag library's
					own keyboard handling.
				-->
				<div class="item-tools">
					<button
						type="button"
						class="chip"
						onclick={(e) => onSelect(block.id, e.currentTarget)}
						aria-label="Edit {label(block)} block, position {order.indexOf(block.id) + 1} of {order.length}"
					>
						Edit
					</button>
					<button type="button" class="nudge" aria-label="Move {label(block)} up" onclick={() => nudge(block.id, -1)}>
						<ArrowUp size={13} aria-hidden="true" />
					</button>
					<button type="button" class="nudge" aria-label="Move {label(block)} down" onclick={() => nudge(block.id, 1)}>
						<ArrowDown size={13} aria-hidden="true" />
					</button>
				</div>
			</div>
		{/each}
	</div>
{/each}

<style>
	.canvas-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.heading-tools {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		opacity: 0;
		transition: opacity 150ms var(--ease-out);
	}

	.canvas-heading:hover .heading-tools,
	.heading-tools:focus-within {
		opacity: 1;
	}

	.chip {
		height: 1.75rem;
		padding-inline: 0.625rem;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		transition: color 150ms var(--ease-out);
	}

	.chip:hover {
		color: var(--text);
	}

	.canvas-heading .chip {
		background-color: var(--surface);
	}

	.canvas-grid {
		position: relative;
	}

	/* A section with nothing in it still has to be a target you can aim at. */
	.canvas-grid.is-empty {
		min-height: 4.5rem;
		border-radius: var(--radius-ui-lg);
		background-color: color-mix(in oklab, var(--text) 4%, transparent);
	}

	.canvas-item {
		position: relative;
		display: grid;
		border-radius: var(--radius-widget-md);
		/* The drag is the gesture; a text selection starting under the finger is
		   never what was meant. */
		-webkit-user-select: none;
		user-select: none;
		cursor: grab;
		transition: scale 150ms var(--ease-press);
	}

	.canvas-item:active {
		cursor: grabbing;
		scale: 0.99;
	}

	.canvas-widget {
		display: grid;
		pointer-events: none;
	}

	.canvas-item:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.canvas-item.is-selected::after {
		content: '';
		position: absolute;
		inset: -3px;
		z-index: 2;
		border-radius: calc(var(--radius-widget-md) + 3px);
		box-shadow: 0 0 0 2px var(--accent);
		pointer-events: none;
	}

	.item-tools {
		position: absolute;
		z-index: 3;
		top: 0.375rem;
		right: 0.375rem;
		display: flex;
		gap: 0.125rem;
		padding: 0.125rem;
		border-radius: var(--radius-pill);
		background-color: color-mix(in oklab, var(--surface) 88%, transparent);
		backdrop-filter: blur(8px);
		opacity: 0;
		transition: opacity 150ms var(--ease-out);
	}

	.canvas-item:hover .item-tools,
	.item-tools:focus-within {
		opacity: 1;
	}

	.nudge {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		transition: color 150ms var(--ease-out);
	}

	.nudge:hover {
		color: var(--text);
	}

	/*
	 * Touch has no hover to reveal them, so the controls are simply present —
	 * and something permanently present must not be sitting on the content.
	 *
	 * Overlaid, they were: a translucent pill parked over the top-right corner
	 * of every card, which is where "Local time" sits on the clock, where the
	 * star count sits on the repo, and where the outbound arrow sits on a link.
	 * On a phone — the one place this editor is most likely to be used — the
	 * preview was covering the thing it exists to preview, with a blur that
	 * made both layers unreadable rather than separating them.
	 *
	 * So on touch they stop being an overlay and take their own lane above the
	 * card. The widget below is a preview, and losing a row of its height costs
	 * far less than losing its top-right corner.
	 */
	@media (hover: none) {
		.canvas-item {
			grid-template-rows: auto minmax(0, 1fr);
			row-gap: 0.25rem;
		}

		/* Explicit rows: the widget is first in the DOM so the tools, which are
		   the only thing here a screen reader sees, come last in reading order —
		   but the lane they take has to be the one above the card. */
		.item-tools {
			position: static;
			grid-row: 1;
			justify-self: end;
			padding: 0;
			background-color: transparent;
			backdrop-filter: none;
			opacity: 1;
		}

		.canvas-widget {
			grid-row: 2;
		}

		.heading-tools {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.canvas-item {
			transition: none;
		}
	}
</style>
