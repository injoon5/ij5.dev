<script lang="ts">
	let { data }: { data: Record<string, string> } = $props();
</script>

<!-- The only kind that is type rather than surface: no card, no border, no
     background. It breaks the grid into labelled sections, and giving it a
     card would make it read as one more widget. -->
<div class="col-span-2 flex items-baseline gap-3 pt-6 pb-1 first:pt-0 lg:col-span-4">
	<h2 class="text-lg font-semibold">{data.text}</h2>
	{#if data.note}
		<span class="text-xs text-text-subtle">{data.note}</span>
	{/if}
</div>
