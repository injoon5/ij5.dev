<script lang="ts">
	import X from 'lucide-svelte/icons/x';
	import BarList from '$lib/ui/BarList.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import Button from '$lib/ui/Button.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { card, cardTitle } from '$lib/ui/styles';
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

	// Stored lower-case; title-cased so every list reads alike.
	const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

	/** The path a row stands for, as a visitor would type it. */
	const path = (slug: string, kind: string) =>
		kind === 'home' ? '/' : kind === 'paste' ? `/p/${slug}` : `/${slug}`;

	let hasData = $derived(data.traffic.length > 0);

	// Filtered to one path, a figure that cannot apply to it (views of a
	// redirect, clicks on a page) is a zero that says nothing — so it goes.
	let metrics = $derived(
		(
			[
				['Clicks', data.totals.clicks],
				['Views', data.totals.views],
				['Visitors', data.totals.visitors]
			] as Array<[string, number]>
		).filter(([label, value]) => data.slug === null || label === 'Visitors' || value > 0)
	);
	let filtered = $derived(data.slug !== null);

	const href = (params: { r?: string; s?: string | null }) => {
		const q = new URLSearchParams();
		q.set('r', params.r ?? data.range);
		const s = params.s === undefined ? data.slug : params.s;
		if (s !== null) q.set('s', s === '' ? '/' : s);
		return `/admin/analytics?${q}`;
	};

	let title = $derived(
		data.slug === null
			? null
			: data.slug === ''
				? '/'
				: (data.top.find((t) => t.slug === data.slug)?.kind === 'paste' ? '/p/' : '/') + data.slug
	);

	const segment =
		'flex items-center rounded-[calc(var(--radius-ui)-3px)] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-text-muted transition-[background-color,color] duration-150 ease-out hover:text-text aria-[current=true]:bg-surface aria-[current=true]:text-text aria-[current=true]:shadow-[0_1px_2px_oklch(0_0_0/0.08),0_0_0_1px_var(--border-subtle)] max-md:flex-1 max-md:justify-center pointer-coarse:min-h-9';
</script>

<svelte:head><title>Analytics</title></svelte:head>

{#snippet ranges()}
	<div
		class="flex gap-0.5 rounded-[var(--radius-ui)] bg-surface-sunken p-[3px]"
		role="group"
		aria-label="Date range"
	>
		{#each RANGE_LABELS as option (option.key)}
			<a
				href={href({ r: option.key })}
				aria-current={data.range === option.key ? 'true' : undefined}
				data-sveltekit-noscroll
				class={segment}
			>
				{option.label}
			</a>
		{/each}
	</div>
{/snippet}

<PageHeader title="Analytics">
	{#snippet meta()}
		{#if title}
			<!-- The filter, and the way out of it. -->
			<a
				href={href({ s: null })}
				data-sveltekit-noscroll
				class="flex h-7 items-center gap-1 rounded-[var(--radius-pill)] bg-accent-tint ps-2.5 pe-1.5 text-xs font-medium text-accent transition-[opacity,scale] duration-150 ease-out hover:opacity-80 active:scale-[0.96]"
				aria-label="Show all paths (filtered to {title})"
			>
				<span class="max-w-40 truncate">{title}</span>
				<X size={13} aria-hidden="true" />
			</a>
		{/if}
	{/snippet}
	{#snippet actions()}
		<div class="max-md:hidden">{@render ranges()}</div>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-4 px-4 pt-1 pb-8 md:px-6 md:pt-6">
	<div class="md:hidden">{@render ranges()}</div>

	{#if !hasData}
		<Empty
			title={filtered ? 'No visits to this path in this range' : 'Nothing recorded yet'}
		>
			{#snippet action()}
				{#if filtered}
					<Button href={href({ s: null })} variant="secondary" size="sm">Show all paths</Button>
				{:else}
					<Button href="/admin?s=new" variant="primary" size="sm">Create a link</Button>
				{/if}
			{/snippet}
		</Empty>
	{:else}
		<!-- Three figures in one strip, three across at every width: stacked
		     they cost a phone a screen of scroll before the chart. -->
		<dl
			class="{card} grid divide-x divide-border-subtle p-0 md:p-0"
			style="grid-template-columns: repeat({metrics.length}, minmax(0, 1fr))"
		>
			{#each metrics as [label, value] (label)}
				<div class="flex flex-col gap-1 px-4 py-3.5 md:px-5 md:py-4">
					<dt class="text-xs text-text-muted">{label}</dt>
					<dd class="text-xl font-semibold tracking-[-0.018em] md:text-2xl">
						{Number(value).toLocaleString('en')}
					</dd>
				</div>
			{/each}
		</dl>

		<section class={card}>
			<h2 class="sr-only">Visits over time</h2>
			<Chart data={data.traffic} label="visits" />
		</section>

		<div class="grid gap-4 lg:grid-cols-2">
			{#if !filtered}
				<BarList
					title="Top paths"
					rows={data.top.map((t) => ({
						label: path(t.slug, t.kind),
						value: t.hits,
						href: href({ s: t.slug })
					}))}
				/>
			{/if}
			<BarList title="Referrers" rows={data.referrers.map((r) => ({
				label: r.referrer === 'direct' ? 'Direct' : r.referrer,
				value: r.hits
			}))} />
			<BarList title="Countries" rows={data.countries.map((c) => ({ label: country(c.country), value: c.hits }))} />
			<BarList title="Devices" rows={data.devices.map((d) => ({ label: cap(d.device), value: d.hits }))} />
			<BarList title="Operating systems" rows={data.os.map((o) => ({ label: o.os, value: o.hits }))} />
			<BarList title="Browsers" rows={data.browsers.map((b) => ({ label: b.browser, value: b.hits }))} />
		</div>
	{/if}

	{#if data.notFound.length}
		<!-- Each path opens the new-link form with its name filled in: seeing
		     one here and creating it is a single click. -->
		<section class={card}>
			<h2 class={cardTitle}>Not found</h2>
			<ul class="mt-3 flex flex-col gap-1">
				{#each data.notFound as n (n.path)}
					<li>
						<a
							href="/admin?s=new&slug={encodeURIComponent(n.path)}"
							class="group flex min-h-8 items-center justify-between gap-3 rounded-[var(--radius-ui-sm)] px-2 transition-colors duration-150 ease-out hover:bg-row-active pointer-coarse:min-h-11"
						>
							<span class="truncate text-sm">/{n.path}</span>
							<span class="flex shrink-0 items-center gap-3 text-sm text-text-muted">
								{n.hits.toLocaleString('en')}
								<span class="text-xs font-medium text-accent opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
									Create link
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
