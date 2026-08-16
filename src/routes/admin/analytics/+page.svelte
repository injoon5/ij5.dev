<script lang="ts">
	import BarList from '$lib/ui/BarList.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { card } from '$lib/ui/styles';
	import { RANGE_LABELS } from './ranges';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const REGION = new Intl.DisplayNames(['en'], { type: 'region' });
	const country = (code: string) => {
		if (code === 'XX' || code.length !== 2) return 'Unknown';
		try {
			return REGION.of(code) ?? code;
		} catch {
			return code;
		}
	};

	// `mobile` / `desktop` / `bot` are stored lower-case; title-case them so the
	// Devices list reads like the Countries, OS and Browser lists beside it.
	const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

	let hasData = $derived(data.traffic.length > 0 || data.totals.hits > 0 || data.totals.home > 0);

	const rangeHref = (key: string) =>
		data.slug ? `/admin/analytics?r=${key}&s=${data.slug}` : `/admin/analytics?r=${key}`;
</script>

<svelte:head><title>Analytics</title></svelte:head>

<header class="mb-6 flex flex-wrap items-center justify-between gap-4">
	<h1 class="text-xl font-semibold">Analytics</h1>

	<!-- A scrollable segmented control. The tabs are ~29px for a mouse; a touch
	     screen gets the 44px row instead. -->
	<div
		class="flex gap-0.5 overflow-x-auto rounded-[var(--radius-ui)] bg-surface p-[0.1875rem] [scrollbar-width:none]"
		role="group"
		aria-label="Date range"
	>
		{#each RANGE_LABELS as option (option.key)}
			<a
				href={rangeHref(option.key)}
				aria-current={data.range === option.key ? 'true' : undefined}
				data-sveltekit-noscroll
				class="rounded-[var(--radius-ui-sm)] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-text-muted transition-colors duration-150 ease-out hover:text-text aria-[current=true]:bg-surface-sunken aria-[current=true]:text-text pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center"
			>
				{option.label}
			</a>
		{/each}
	</div>
</header>

{#if !hasData}
	<Empty
		title="Nothing recorded yet"
		body="Counts appear as soon as someone follows a link or opens the homepage. Every hit is aggregated on write, so these numbers are exact rather than sampled."
	>
		{#snippet action()}
			<Button href="/admin" variant="primary" size="sm">Create a link</Button>
		{/snippet}
	</Empty>
{:else}
	<!-- Three short figures, three across at every width. Stacked, they cost a
	     phone 330px of scroll before the chart. -->
	<div class="grid grid-cols-3 gap-2 sm:gap-4">
		<div class="rounded-[var(--radius-ui-lg)] bg-surface p-3.5 sm:p-5">
			<p class="tnum text-xl font-semibold sm:text-2xl">{data.totals.hits}</p>
			<p class="mt-0.5 text-xs text-pretty text-text-muted">Redirects</p>
		</div>
		<div class="rounded-[var(--radius-ui-lg)] bg-surface p-3.5 sm:p-5">
			<p class="tnum text-xl font-semibold sm:text-2xl">{data.totals.home}</p>
			<p class="mt-0.5 text-xs text-pretty text-text-muted">Homepage views</p>
		</div>
		<div class="rounded-[var(--radius-ui-lg)] bg-surface p-3.5 sm:p-5">
			<p class="tnum text-xl font-semibold sm:text-2xl">{data.totals.visitors}</p>
			<p class="mt-0.5 text-xs text-pretty text-text-muted">Daily uniques</p>
		</div>
	</div>

	<section class="{card} mt-4">
		<h2 class="text-sm font-semibold">Traffic</h2>
		<div class="mt-3">
			<Chart data={data.traffic} />
		</div>
	</section>

	<div class="mt-4 grid gap-4 lg:grid-cols-2">
		<BarList
			title="Top links"
			rows={data.links.map((l) => ({
				label: `/${l.slug}`,
				value: l.hits,
				href: `/admin/analytics?r=${data.range}&s=${encodeURIComponent(l.slug)}`
			}))}
			empty="No redirects in this range."
		/>

		<BarList
			title="Referrers"
			rows={data.referrers.map((r) => ({ label: r.referrer, value: r.hits }))}
			empty="No referrers recorded. Direct visits count as “direct”."
		/>

		<BarList
			title="Countries"
			rows={data.countries.map((c) => ({ label: country(c.country), value: c.hits }))}
			empty="No geography recorded yet."
		/>

		<BarList
			title="Devices"
			rows={data.devices.map((d) => ({ label: cap(d.device), value: d.hits }))}
			empty="No devices recorded yet."
		/>

		<BarList
			title="Operating systems"
			rows={data.os.map((o) => ({ label: o.os, value: o.hits }))}
			empty="No OS data recorded yet."
		/>

		<BarList
			title="Browsers"
			rows={data.browsers.map((b) => ({ label: b.browser, value: b.hits }))}
			empty="No browser data recorded yet."
		/>
	</div>

	{#if data.notFound.length}
		<div class="mt-4">
			<BarList
				title="Paths that 404’d"
				rows={data.notFound.map((n) => ({ label: `/${n.path}`, value: n.hits }))}
				empty="Nothing missing."
			/>
			<p class="mt-2 px-1 text-xs text-text-subtle">
				Anything here that people clearly expected is a link worth creating.
			</p>
		</div>
	{/if}

	{#if data.detail}
		<!--
			Streamed from the load function, so the panels above paint without
			waiting on it. `#await` is the loading state, not a spinner bolted on
			after the fact.
		-->
		{#await data.detail}
			<section class="{card} mt-8">
				<p class="text-sm text-text-muted">Loading breakdown…</p>
			</section>
		{:then detail}
			<section class="mt-8">
				<div class="mb-3 flex items-center justify-between gap-4">
					<h2 class="text-lg font-semibold">/{detail.slug}</h2>
					<Button href="/admin/analytics?r={data.range}" variant="ghost" size="sm">Clear</Button>
				</div>

				<div class="grid gap-4 lg:grid-cols-3">
					<BarList
						level={3}
						title="Referrers"
						rows={detail.referrers.map((r) => ({ label: r.referrer, value: r.hits }))}
						empty="No referrers for this link."
					/>
					<BarList
						level={3}
						title="Countries"
						rows={detail.countries.map((c) => ({ label: country(c.country), value: c.hits }))}
						empty="No geography for this link."
					/>
					<BarList
						level={3}
						title="Devices"
						rows={detail.devices.map((d) => ({ label: cap(d.device), value: d.hits }))}
						empty="No devices for this link."
					/>
					<BarList
						level={3}
						title="Operating systems"
						rows={detail.os.map((o) => ({ label: o.os, value: o.hits }))}
						empty="No OS data for this link."
					/>
					<BarList
						level={3}
						title="Browsers"
						rows={detail.browsers.map((b) => ({ label: b.browser, value: b.hits }))}
						empty="No browser data for this link."
					/>
				</div>
			</section>
		{:catch}
			<section class="{card} mt-8">
				<p class="text-sm text-danger">That breakdown could not be loaded.</p>
			</section>
		{/await}
	{/if}
{/if}

