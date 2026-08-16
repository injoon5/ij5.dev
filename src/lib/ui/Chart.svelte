<script module lang="ts">
	/** Module-scoped so two charts on one page never share a gradient id. */
	let washSeq = 0;
</script>

<script lang="ts">
	/**
	 * A line chart, in the shape of the sparkline on injoon5/web: no gridlines,
	 * no tooltip box, an axis that is only ever text, and a headline above that
	 * carries the exact value for whatever day the pointer is on.
	 *
	 * Hand-drawn rather than LayerChart. The reference reaches for a library
	 * because it draws four of these against a shared domain with a tuning panel
	 * bound to every dimension; this is one chart with one series. A chart
	 * library would bring a scale abstraction, a plugin architecture and a theme
	 * to strip, and would still need the touch handling and tick thinning
	 * written by hand — which is all that is actually below.
	 */

	type Point = { day: string; hits: number };

	let { data, label = 'hits' }: { data: Point[]; label?: string } = $props();

	// The wash gradient needs a stable, unique id per instance — a hardcoded id
	// would collide the day a page renders two charts.
	const WASH_ID = `chart-wash-${++washSeq}`;

	/**
	 * Geometry is in real pixels against the measured width, not a fixed viewBox
	 * stretched to fit. `preserveAspectRatio="none"` would scale x and y by
	 * different factors, which distorts everything that is not a path — the axis
	 * numbers stretch, the stroke thins, a round marker renders as an ellipse.
	 * Measuring costs one bound property and removes the whole class of problem.
	 */
	/** Vertical breathing room, so a peak never touches the top of the box. */
	const PAD_Y = 10;
	/** Left gutter the y labels start in, in viewBox units. */
	const GUTTER = 46;

	let active = $state<number | null>(null);
	let width = $state(0);
	let height = $state(0);
	let plot = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	let single = $derived(data.length === 1);

	// SSR has no width. The box reserves its height in CSS, so the line simply
	// appears once hydrated rather than shifting the numbers above it.
	let W = $derived(Math.max(width, 1));
	// Both axes, for the same reason: a viewBox height of 200 drawn into a 176px
	// box is a 0.88 vertical scale, which squashes the axis numbers just as
	// surely as a stretched width would.
	let H = $derived(Math.max(height, 1));

	/**
	 * The domain floors at zero rather than at the smallest reading. Traffic is
	 * a count, so a chart that starts at 40 makes a quiet week look like a
	 * collapse — the shape of the line has to be the shape of the numbers.
	 */
	let max = $derived(Math.max(1, ...data.map((d) => d.hits)));
	let top = $derived(max * 1.12);

	let step = $derived(data.length > 1 ? (W - GUTTER) / (data.length - 1) : 0);

	const x = (i: number) => GUTTER + i * step;
	const y = (v: number) => H - PAD_Y - (v / top) * (H - PAD_Y * 2);

	let line = $derived(data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.hits)}`).join(' '));
	let area = $derived(
		data.length > 1 ? `${line} L${x(data.length - 1)},${H} L${x(0)},${H} Z` : ''
	);

	/** One significant figure below the value's magnitude: 171 → 170, 7 → 7. */
	function round(v: number): number {
		if (v < 10) return Math.round(v);
		const magnitude = 10 ** (Math.floor(Math.log10(v)) - 1);
		return Math.round(v / magnitude) * magnitude;
	}

	/**
	 * Two numbers and nothing else. The readout above already carries the exact
	 * value, so the axis only has to say what order of magnitude the line is
	 * drawn at — and two labels that format to the same string are one label and
	 * a rounding error.
	 */
	let ticks = $derived.by(() => {
		const nice = [max, round(max / 2)].filter((v, i, all) => v > 0 && all.indexOf(v) === i);
		return nice.filter((v, i) => i === 0 || Math.abs(y(v) - y(nice[i - 1])) > 18);
	});

	const compact = (v: number) =>
		v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

	let current = $derived(active !== null ? data[active] : null);

	const fmtDay = (day: string) =>
		new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(
			new Date(`${day}T00:00:00Z`)
		);

	let readout = $derived(
		current ? `${current.hits} ${label} on ${fmtDay(current.day)}` : `peak ${max} ${label} in range`
	);

	function indexAt(clientX: number) {
		const rect = plot?.getBoundingClientRect();
		if (!rect || data.length === 0) return null;
		if (data.length === 1) return 0;

		// The gutter is part of the box but not part of the plot, so the ratio is
		// taken against the drawn span — otherwise the marker trails the finger.
		// Geometry is 1:1 with pixels now, so the gutter needs no conversion.
		const span = rect.width - GUTTER;
		if (span <= 0) return null;

		const ratio = (clientX - rect.left - GUTTER) / span;
		return Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1))));
	}

	/**
	 * Pointer capture on the way down pins the whole drag to this element.
	 * Without it a finger dragged past the edge is re-targeted by hit test on
	 * every move and the readout jumps to whatever it crosses into.
	 */
	function onpointerdown(event: PointerEvent) {
		plot?.setPointerCapture?.(event.pointerId);
		dragging = true;
		active = indexAt(event.clientX);
	}

	function onpointermove(event: PointerEvent) {
		// A mouse scrubs on hover; a finger only while it is down.
		if (!dragging && event.pointerType === 'touch') return;
		active = indexAt(event.clientX);
	}

	function release(event: PointerEvent) {
		if (plot?.hasPointerCapture?.(event.pointerId)) plot.releasePointerCapture(event.pointerId);
		dragging = false;
		// A finger has no hover state to fall back to, so lifting it clears the
		// day. A mouse keeps the marker until the pointer actually leaves.
		if (event.pointerType === 'touch') active = null;
	}

	function onpointerleave() {
		if (!dragging) active = null;
	}

	/** Arrow keys scrub. Without this the per-day values are pointer-only. */
	function onkeydown(event: KeyboardEvent) {
		if (!data.length) return;
		const last = data.length - 1;
		const at = active ?? last;
		let to: number | null = null;

		if (event.key === 'ArrowLeft') to = Math.max(0, at - 1);
		else if (event.key === 'ArrowRight') to = Math.min(last, at + 1);
		else if (event.key === 'Home') to = 0;
		else if (event.key === 'End') to = last;
		else if (event.key === 'Escape') {
			if (active === null) return;
			active = null;
			event.preventDefault();
			return;
		} else return;

		event.preventDefault();
		active = to;
	}
</script>

{#if !data.length}
	<p class="py-10 text-center text-sm text-pretty text-text-muted">No traffic in this range yet.</p>
{:else}
	<!-- The number is the headline and the chart is the footnote. No transition
	     on the value: scrubbing is direct manipulation, and a number easing
	     toward the day under the pointer reads as lag. -->
	<!-- No live region: `aria-valuetext` on the plot below is the spoken
	     channel, and announcing both means every scrub is said twice. -->
	<div class="flex items-baseline gap-2" aria-hidden="true">
		<span class="tnum text-2xl font-semibold">{(current ?? { hits: max }).hits}</span>
		<span class="text-sm text-text-muted">
			{#if current}{label} on {fmtDay(current.day)}{:else}peak {label} in range{/if}
		</span>
	</div>

	<!-- A vertical swipe still scrolls the page; a horizontal drag scrubs. -->
	<div
		class="mt-3 h-44 [touch-action:pan-y] select-none sm:h-52"
		bind:this={plot}
		bind:clientWidth={width}
		bind:clientHeight={height}
		role="slider"
		tabindex="0"
		aria-label="Traffic over time"
		aria-valuemin="0"
		aria-valuemax={data.length - 1}
		aria-valuenow={active ?? data.length - 1}
		aria-valuetext={readout}
		{onkeydown}
		{onpointerdown}
		{onpointermove}
		{onpointerleave}
		onpointerup={release}
		onpointercancel={release}
	>
		<svg viewBox="0 0 {W} {H}" class="block size-full">
			<defs>
				<linearGradient id={WASH_ID} x1="0" x2="0" y1="0" y2="1">
					<!-- An ease-out ramp, not a linear one, which held a flat film and
					     then stopped dead at the baseline. -->
					<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.20" />
					<stop offset="42%" stop-color="var(--accent)" stop-opacity="0.09" />
					<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
				</linearGradient>
			</defs>

			<!-- Text only: no rule under the labels, no gridlines across the plot,
			     not even a tick mark. The numbers are there to size the line, and
			     anything drawn to connect them to it competes with the line. -->
			{#each ticks as tick (tick)}
				<text class="fill-text-subtle text-[11px] tnum" x="0" y={y(tick)} dominant-baseline="middle">{compact(tick)}</text>
			{/each}

			{#if single}
				<!-- One day is a bar, not a trend. A lone point is its own maximum,
				     so a line — or a band mirrored from it — floods the full height
				     of the plot and says "100%" rather than "one day, this many". -->
				<rect
					x={GUTTER + (W - GUTTER) / 2 - 26}
					y={y(data[0].hits)}
					width="52"
					height={Math.max(0, H - y(data[0].hits))}
					fill="var(--accent)"
					opacity="0.85"
				/>
			{:else}
				<path d={area} fill="url(#{WASH_ID})" />
				<path
					d={line}
					fill="none"
					stroke="var(--accent)"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}

			{#if current && !single}
				<line
					x1={x(active!)}
					x2={x(active!)}
					y1="0"
					y2={H}
					stroke="var(--border-strong)"
					stroke-width="1"
				/>
				<circle cx={x(active!)} cy={y(current.hits)} r="3.5" fill="var(--accent)" />
			{/if}
		</svg>
	</div>

	<!-- The accessible version of the chart. A line has nothing to read out;
	     the numbers do. -->
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

	<!--
		Flush with the panel rather than indented to the plot: the heading, the
		readout, the axis labels and these dates all start on one column, which
		reads as alignment. The gap between this date and the first point is a
		distance nobody measures; two staggered left edges is one anybody sees.
	-->
	<div class="mt-2 flex justify-between text-xs text-text-subtle">
		<span class="tnum">{fmtDay(data[0].day)}</span>
		{#if !single}<span class="tnum">{fmtDay(data[data.length - 1].day)}</span>{/if}
	</div>
{/if}
