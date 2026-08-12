<script lang="ts">
	import type { Block, Span } from '$lib/types';
	import { components, isKind } from './index';
	import { defFor } from './catalog';

	let {
		block,
		live,
		eager = false,
		/** A block that fails its schema: hidden on `/`, flagged in the editor. */
		onInvalid = 'hide'
	}: {
		block: Block;
		live?: unknown;
		eager?: boolean;
		onInvalid?: 'hide' | 'placeholder';
	} = $props();

	// Grid placement. Four columns at `lg`, two below — a `2x1` is therefore
	// the full width of a phone, which is the point: mobile is a different
	// layout, not the same one scaled.
	const SPAN_CLASS: Record<Span, string> = {
		'1x1': 'col-span-1',
		'2x1': 'col-span-2',
		'2x2': 'col-span-2 row-span-2',
		full: 'col-span-2 lg:col-span-4'
	};

	/**
	 * A content-driven kind takes its width from the span and its height from
	 * what is in it. Holding a three-row list to the two rows a `2x2` reserves
	 * puts a quarter-page of dead space inside the card — and dead space inside
	 * a widget is exactly what stops a grid reading as one system. Rows still
	 * stretch to their tallest item, so neighbours line up either way.
	 */
	const FLEXIBLE_SPAN_CLASS: Partial<Record<Span, string>> = {
		'2x2': 'col-span-2'
	};

	let flexible = $derived(isKind(block.kind) && Boolean(defFor(block.kind).flexible));

	let spanClass = $derived(
		(flexible ? FLEXIBLE_SPAN_CLASS[block.span] : undefined) ?? SPAN_CLASS[block.span]
	);

	// `heading` is a section rule rather than a cell, so `BentoGrid` renders it
	// between grids and it never reaches this component.
	let Widget = $derived(
		isKind(block.kind) && block.kind !== 'heading' ? components[block.kind] : null
	);

	/**
	 * Widgets read `data` without guarding it, so a row stored under an older
	 * shape reaches a renderer that throws — and on `/` that throws out of the
	 * SSR pass and 500s the page. Newly added blocks land here too: their
	 * defaults are deliberately empty and fail the same check.
	 */
	let valid = $derived.by(() => {
		if (!isKind(block.kind)) return false;
		return defFor(block.kind).schema.safeParse(block.data).success;
	});

	let label = $derived(isKind(block.kind) ? defFor(block.kind).label : block.kind);
</script>

{#if Widget && valid}
	<!--
		`grid` on the wrapper, not `block`: the wrapper is what the grid sizes,
		and a block-level child would sit at its own content height inside it.
		That is what left a hole under every `2x2` — the area was two rows tall
		and the widget in it was not.
	-->
	<div class="grid {spanClass}">
		<Widget span={block.span} data={block.data} {live} {eager} />
	</div>
{:else if Widget && onInvalid === 'placeholder'}
	<div class="grid {spanClass}">
		<div class="widget h-full items-center justify-center text-center">
			<p class="text-sm font-semibold text-text-muted">{label}</p>
			<p class="mt-1 text-xs text-pretty text-text-subtle">Fill in its fields to show it.</p>
		</div>
	</div>
{/if}
