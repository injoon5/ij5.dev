<script lang="ts">
	import type { Block, Span } from '$lib/types';
	import { components, isKind } from './index';
	import { defFor } from './catalog';

	let {
		block,
		live,
		eager = false,
		/**
		 * What a block whose data no longer matches its kind should look like.
		 * The public page shows nothing — a hole in the grid is a bad day, a
		 * broken card is a bad day everybody can see. The editor shows a
		 * placeholder, because a block you cannot see is a block you cannot fix.
		 */
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
	 * Every widget trusts the shape of `data` — `Text` splits `data.body`,
	 * `List` iterates `data.items` — because the catalog's schema validates on
	 * write and nothing invalid should reach a renderer.
	 *
	 * Should. Rows outlive the schema that wrote them: rename a field in the
	 * catalog, ship it, and every block stored under the old shape now reaches
	 * a component that reads a property which is no longer there. `Text` threw
	 * on `undefined.split`, that threw out of the whole SSR pass, and one stale
	 * block took the entire public page to a 500 — the one page that has to
	 * render no matter what, on the one code path with no client to recover on.
	 *
	 * `bento.ts` already says the intent for the parse step: "A block that
	 * cannot be parsed renders as nothing rather than taking the page down with
	 * it." This is that same rule applied one layer further in, where the shape
	 * is checked rather than the syntax. The schemas are already imported here
	 * and `/` is edge-cached per published version, so the cost is a handful of
	 * validations on a cache miss.
	 */
	let valid = $derived.by(() => {
		if (!isKind(block.kind)) return false;
		return defFor(block.kind).schema.safeParse(block.data).success;
	});
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
		<div
			class="widget h-full items-center justify-center text-center text-xs text-pretty text-text-subtle"
		>
			This block’s fields no longer match its type. Open it to fix them.
		</div>
	</div>
{/if}
