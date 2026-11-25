<script lang="ts">
	import { tintHex } from '$lib/apps/tints';

	/**
	 * The app's icon as near as a browser can draw it. SF Symbols only render
	 * on Apple platforms, so the tile carries the name's first letter on the
	 * tint; the symbol name itself is shown beside the field that sets it.
	 * The corner radius is the Home Screen's proportion, not a fixed radius,
	 * so the tile reads as an app icon at any size.
	 */
	let { name, tint, size = 32 }: { name: string; tint: string; size?: number } = $props();

	let letter = $derived(Array.from(name.trim())[0]?.toUpperCase() ?? '?');
	let color = $derived(tintHex(tint));
</script>

<span
	class="grid shrink-0 place-items-center rounded-[22.5%] font-semibold text-white shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.08)] select-none"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{Math.round(size * 0.45)}px"
	style:background-color={color}
	aria-hidden="true"
>
	{letter}
</span>
