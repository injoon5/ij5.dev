<script lang="ts">
	let { data, first = false }: { data: Record<string, string>; first?: boolean } = $props();
</script>

<!--
	The only kind that is type rather than surface: no card, no border, no
	background. It breaks the grid into labelled sections, and giving it a card
	would make it read as one more widget.

	It sits between grids rather than inside one, so it takes the height of its
	own type — see `BentoGrid`.

	The space above it is what makes it a section break rather than a caption.
	Cards inside a grid sit 12–14px apart, so a heading only 36px off the row
	above it read as barely more separated than two neighbouring cards, and the
	label appeared to belong to the grid it was ending. It is now roughly four
	times the card gap above and one gap below: far from what it follows, close
	to what it introduces.

	`first` comes from the renderer rather than a `:first-child` selector. Both
	renderers wrap this element — the editor puts its controls beside it — so
	`:first-child` matched the wrapper's first child, which is always this, and
	quietly zeroed the top space on *every* heading in the canvas.
-->
<div
	class="flex items-baseline gap-3 pb-3.5 lg:pb-4"
	class:pt-11={!first}
	class:lg:pt-16={!first}
>
	<h2 class="text-lg font-semibold">{data.text}</h2>
	{#if data.note}
		<span class="text-xs text-text-subtle">{data.note}</span>
	{/if}
</div>
