<script lang="ts">
	import BarList from '$lib/ui/BarList.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import Button from '$lib/ui/Button.svelte';
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

	let hasData = $derived(data.traffic.length > 0 || data.totals.hits > 0 || data.totals.bento > 0);

	const rangeHref = (key: string) =>
		data.slug ? `/admin/analytics?r=${key}&s=${data.slug}` : `/admin/analytics?r=${key}`;
</script>

<svelte:head><title>Analytics</title></svelte:head>

<header class="mb-6 flex flex-wrap items-center justify-between gap-4">
	<h1 class="text-xl font-semibold">Analytics</h1>

	<div class="ranges" role="group" aria-label="Date range">
		{#each RANGE_LABELS as option (option.key)}
			<a
				href={rangeHref(option.key)}
				aria-current={data.range === option.key ? 'true' : undefined}
				data-sveltekit-noscroll
			>
				{option.label}
			</a>
		{/each}
	</div>
</header>

{#if !hasData}
	<Empty
		title="Nothing recorded yet"
		body="Counts appear as soon as someone follows a link or opens the bento. Every hit is aggregated on write, so these numbers are exact rather than sampled."
	>
		{#snippet action()}
			<Button href="/admin" variant="primary" size="sm">Create a link</Button>
		{/snippet}
	</Empty>
{:else}
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="stat">
			<p class="tnum text-2xl font-semibold">{data.totals.hits}</p>
			<p class="mt-0.5 text-xs text-text-muted">Redirects</p>
		</div>
		<div class="stat">
			<p class="tnum text-2xl font-semibold">{data.totals.bento}</p>
			<p class="mt-0.5 text-xs text-text-muted">Bento views</p>
		</div>
		<div class="stat">
			<p class="tnum text-2xl font-semibold">{data.totals.visitors}</p>
			<p class="mt-0.5 text-xs text-text-muted">Daily uniques</p>
		</div>
	</div>

	<section class="mt-4 rounded-[var(--radius-ui-lg)] bg-surface p-5">
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
			rows={data.devices.map((d) => ({ label: d.device, value: d.hits }))}
			empty="No devices recorded yet."
		/>
	</div>

	{#if data.notFound.length}
		<div class="mt-4">
			<BarList
				title="Paths that 404'd"
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
			<section class="mt-4 rounded-[var(--radius-ui-lg)] bg-surface p-5">
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
						rows={detail.devices.map((d) => ({ label: d.device, value: d.hits }))}
						empty="No devices for this link."
					/>
				</div>
			</section>
		{:catch}
			<p class="mt-4 text-sm text-danger">That breakdown could not be loaded.</p>
		{/await}
	{/if}
{/if}

<style>
	.stat {
		border-radius: var(--radius-ui-lg);
		background-color: var(--surface);
		padding: 1.25rem;
	}

	.ranges {
		display: flex;
		gap: 0.125rem;
		border-radius: var(--radius-ui);
		background-color: var(--surface);
		padding: 0.1875rem;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.ranges a {
		border-radius: var(--radius-ui-sm);
		padding: 0.375rem 0.625rem;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-muted);
		white-space: nowrap;
		transition: background-color 150ms var(--ease-out), color 150ms var(--ease-out);
	}

	.ranges a[aria-current='true'] {
		background-color: var(--surface-sunken);
		color: var(--text);
	}

	@media (hover: hover) and (pointer: fine) {
		.ranges a:hover {
			color: var(--text);
		}
	}
</style>
