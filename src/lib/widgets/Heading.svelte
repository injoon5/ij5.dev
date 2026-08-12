<script lang="ts">
	let { data }: { data: Record<string, string> } = $props();
</script>

<!-- The only kind that is type rather than surface: no card, no border, no
     background. It breaks the grid into labelled sections, and giving it a
     card would make it read as one more widget.

     It sits between grids rather than inside one, so it takes the height of
     its own type — see `BentoGrid`. -->
<div class="flex items-baseline gap-3 pt-9 pb-3 first:pt-0">
	<h2 class="text-lg font-semibold">{data.text}</h2>
	{#if data.note}
		<span class="text-xs text-text-subtle">{data.note}</span>
	{/if}
</div>
