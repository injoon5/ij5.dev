<script lang="ts">
	/**
	 * A purpose-built area chart rather than a charting library.
	 *
	 * The dashboard needs exactly one chart shape: a dense daily series with a
	 * crosshair readout. A library would bring a plugin architecture, a scale
	 * abstraction and a theme to strip for that, and it would still need the
	 * touch handling and tick thinning written by hand. This is the whole
	 * feature in one file with no dependency.
	 */

	type Point = { day: string; hits: number };

	let { data, label = 'hits' }: { data: Point[]; label?: string } = $props();

	const W = 800;
	const H = 220;
	const PAD_Y = 12;

	let active = $state<number | null>(null);
	let width = $state(0);

	/**
	 * A single day is the common case on a new install, and a one-point line
	 * draws nothing at all. Mirroring the point gives a flat band that reads
	 * correctly as "one day, this many" instead of an empty box.
	 */
	let series = $derived(data.length === 1 ? [data[0], data[0]] : data);

	let max = $derived(Math.max(1, ...series.map((d) => d.hits)));
	let step = $derived(series.length > 1 ? W / (series.length - 1) : 0);

	const x = (i: number) => i * step;
	const y = (v: number) => H - PAD_Y - (v / max) * (H - PAD_Y * 2);

	let line = $derived(series.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.hits)}`).join(' '));
	let area = $derived(
		series.length > 1 ? `${line} L${x(series.length - 1)},${H} L${x(0)},${H} Z` : ''
	);

	// Four or five ticks, not one per day. More than that on a phone is a
	// smear, and the crosshair is where exact values come from anyway.
	let ticks = $derived.by(() => {
		if (data.length < 2) return [0];
		const want = width && width < 480 ? 3 : 5;
		const every = Math.max(1, Math.ceil(series.length / want));
		return series.map((_, i) => i).filter((i) => i % every === 0 || i === series.length - 1);
	});

	let current = $derived(active !== null ? series[active] : null);

	const fmtDay = (day: string) =>
		new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(
			new Date(`${day}T00:00:00Z`)
		);

	function locate(event: PointerEvent) {
		const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		const ratio = (event.clientX - rect.left) / rect.width;
		active = Math.min(series.length - 1, Math.max(0, Math.round(ratio * (series.length - 1))));
	}
</script>

{#if !data.length}
	<p class="py-10 text-center text-sm text-pretty text-text-muted">
		No traffic in this range yet.
	</p>
{:else}
<div class="chart" bind:clientWidth={width}>
	<div class="readout" aria-live="polite">
		{#if current}
			<span class="tnum text-lg font-semibold">{current.hits}</span>
			<span class="text-xs text-text-muted">{label} on {fmtDay(current.day)}</span>
		{:else}
			<span class="tnum text-lg font-semibold">{max}</span>
			<span class="text-xs text-text-muted">peak {label} in range</span>
		{/if}
	</div>

	<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Traffic over time">
		<defs>
			<linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
				<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.18" />
				<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
			</linearGradient>
		</defs>

		{#if area}
			<path d={area} fill="url(#chart-fill)" />
			<path
				d={line}
				fill="none"
				stroke="var(--accent)"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>
		{/if}

		{#if active !== null && series[active]}
			<line
				x1={x(active)}
				x2={x(active)}
				y1="0"
				y2={H}
				stroke="var(--border-strong)"
				stroke-width="1"
				vector-effect="non-scaling-stroke"
			/>
			<circle cx={x(active)} cy={y(series[active].hits)} r="4" fill="var(--accent)" />
		{/if}

		<!--
			One transparent target for the whole plot: pointer events cover
			mouse, pen and touch, so there is no separate touch path to forget.

			It carries no role because it is a pointer affordance and nothing
			else — the series itself is exposed to assistive technology as the
			table below, which is a better reading of a chart than a hover
			target could ever be.
		-->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<rect
			width={W}
			height={H}
			fill="transparent"
			onpointermove={locate}
			onpointerdown={locate}
			onpointerleave={() => (active = null)}
		></rect>
	</svg>

	<table class="sr-only">
		<caption>Traffic over time</caption>
		<thead>
			<tr><th scope="col">Day</th><th scope="col">{label}</th></tr>
		</thead>
		<tbody>
			{#each data as point (point.day)}
				<tr><th scope="row">{fmtDay(point.day)}</th><td>{point.hits}</td></tr>
			{/each}
		</tbody>
	</table>

	<!-- Inline labels rather than a legend: a legend costs a second lookup on
	     a chart with one series. -->
	<div class="axis">
		{#each ticks as i (i)}
			<span class="tnum" style="left: {(x(i) / W) * 100}%">{fmtDay(series[i].day)}</span>
		{/each}
	</div>
</div>
{/if}

<style>
	.chart {
		position: relative;
	}

	.readout {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		min-height: 1.75rem;
	}

	svg {
		display: block;
		width: 100%;
		height: 12rem;
		touch-action: pan-y;
	}

	.axis {
		position: relative;
		height: 1.25rem;
		margin-top: 0.25rem;
	}

	.axis span {
		position: absolute;
		transform: translateX(-50%);
		font-size: var(--text-2xs);
		color: var(--text-subtle);
		white-space: nowrap;
	}

	/* The first and last labels would otherwise hang off the plot. */
	.axis span:first-child {
		transform: none;
	}

	.axis span:last-child {
		transform: translateX(-100%);
	}
</style>
