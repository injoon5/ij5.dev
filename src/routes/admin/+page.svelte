<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Plus from 'lucide-svelte/icons/plus';
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import Button from '$lib/ui/Button.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import DetailHeader from '$lib/ui/DetailHeader.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import MasterDetail from '$lib/ui/MasterDetail.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import SearchField from '$lib/ui/SearchField.svelte';
	import { fmtDay } from '$lib/format';
	import { listShortcuts } from '$lib/ui/shortcuts';
	import { badge, iconButton, kbd, rowSub, rowTitle, table, tableBody, tableHead, tableRow } from '$lib/ui/styles';
	import LinkForm from './LinkForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	let creating = $derived(page.url.searchParams.get('s') === 'new');
	let open = $derived(creating || Boolean(data.selected));

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.slugs;
		return data.slugs.filter(
			(s) =>
				s.slug.toLowerCase().includes(q) ||
				s.target_url.toLowerCase().includes(q) ||
				(s.note ?? '').toLowerCase().includes(q)
		);
	});

	// A mailto: or tel: destination has no hostname; show the whole thing
	// rather than a blank cell where the host would be.
	const host = (url: string) => {
		try {
			const parsed = new URL(url);
			if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
				return parsed.hostname.replace(/^www\./, '');
			}
			return url;
		} catch {
			return url;
		}
	};

	// Name, destination, note, clicks, created — shared by the header row and
	// every row so the columns can only line up.
	const cols = 'md:grid-cols-[minmax(7rem,13rem)_minmax(0,1.4fr)_minmax(0,1fr)_4rem_4.5rem]';

	const onkeydown = listShortcuts('/admin', () => ({ open, search: searchEl }));
</script>

<svelte:head><title>Links</title></svelte:head>
<svelte:window {onkeydown} />

<MasterDetail {open} label="Link">
	{#snippet list()}
		<PageHeader title="Links">
			{#snippet actions()}
				<Button href="/admin?s=new" variant="primary"
					size="sm"
					data-sveltekit-noscroll
					class="max-md:size-10 max-md:rounded-full max-md:px-0"
				>
					<Plus size={15} aria-hidden="true" class="max-md:size-5" />
					<span class="max-md:sr-only">New link</span>
				</Button>
			{/snippet}
		</PageHeader>

		{#if !data.slugs.length}
			<Empty title="No links yet">
				{#snippet action()}
					<Button href="/admin?s=new" variant="primary" size="sm">Create a link</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="px-4 pb-3 md:px-6 md:pt-3">
				<SearchField bind:value={query} bind:el={searchEl} label="Search links" />
			</div>

			<!-- The list rewrites itself as you type; without this nothing says so. -->
			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'link matches' : 'links match'} “{query.trim()}”
				{/if}
			</p>

			{#if !visible.length}
				<Empty title="No links match “{query.trim()}”" />
			{:else}
				<div class={table}>
					<div class="{tableHead} {cols}" aria-hidden="true">
						<span>Link</span>
						<span>Destination</span>
						<span>Note</span>
						<span class="text-right" title="Clicks in the last 7 days">Clicks</span>
						<span class="text-right">Created</span>
					</div>
					<ul class={tableBody}>
						{#each visible as row (row.slug)}
							{@const clicks = data.recent[row.slug] ?? 0}
							<li>
								<a
									href="/admin?s={encodeURIComponent(row.slug)}"
									data-sveltekit-noscroll
									aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
									class="{tableRow} {cols}"
								>
									<span class="flex min-w-0 items-center gap-2 {rowTitle}">
										<span class="truncate">/{row.slug}</span>
										{#if row.expired}
											<span class={badge}>Expired</span>
										{:else if row.status === 301}
											<span class={badge}>301</span>
										{/if}
									</span>

									<span class="col-start-1 {rowSub} md:col-start-auto">
										{host(row.target_url)}
									</span>

									<span class="hidden truncate text-sm text-text-muted md:block">{row.note ?? ''}</span>

									<span
										class="col-start-2 row-start-2 text-right text-xs text-text-muted md:col-start-auto md:row-start-auto md:text-sm"
									>
										{clicks}<span class="md:sr-only">&nbsp;{clicks === 1 ? 'click' : 'clicks'}</span>
									</span>

									<span
										class="col-start-2 row-start-1 text-right text-xs text-text-subtle md:col-start-auto md:row-start-auto md:text-sm md:text-text-muted"
									>
										{fmtDay(row.created_at)}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}
	{/snippet}

	{#snippet detail()}
		{#if creating}
			<DetailHeader title="New link" close="/admin" backLabel="Links" />
			<div class="p-4 md:p-5">
				<LinkForm
					row={null}
					fields={form?.intent === 'create' ? form.fields : undefined}
					values={form?.intent === 'create'
						? form.values
						: { slug: page.url.searchParams.get('slug') ?? '' }}
					error={form?.intent === 'create' ? form.error : undefined}
					onDone={(slug) => goto(slug ? `/admin?s=${encodeURIComponent(slug)}` : '/admin', { noScroll: true })}
				/>
			</div>
		{:else if data.selected}
			{@const short = `${page.url.origin}/${data.selected.slug}`}
			<DetailHeader title="/{data.selected.slug}" close="/admin" backLabel="Links">
				{#snippet actions()}
					<CopyButton text={short} label="Copy short link" />
					<a
						href={data.selected?.target_url}
						target="_blank"
						rel="noopener noreferrer"
						class={iconButton}
						aria-label="Open destination"
						title="Open destination"
					>
						<ArrowUpRight size={16} aria-hidden="true" />
					</a>
				{/snippet}
			</DetailHeader>
			<div class="p-4 md:p-5">
				<!-- Keyed, so switching rows remounts the form instead of carrying
				     one link's half-edited fields over to the next. -->
				{#key data.selected.slug}
					<LinkForm
						row={data.selected}
						fields={form?.intent === 'update' ? form.fields : undefined}
						values={form?.intent === 'update' ? form.values : undefined}
						error={form?.intent === 'update' || form?.intent === 'delete' ? form.error : undefined}
						onDone={() => goto('/admin', { noScroll: true })}
					/>
				{/key}
			</div>
		{:else}
			<div class="grid h-full min-h-40 place-items-center p-8 text-center max-lg:hidden">
				<p class="text-sm text-text-muted">
					Select a link, or press <kbd class={kbd}>N</kbd> to create one.
				</p>
			</div>
		{/if}
	{/snippet}
</MasterDetail>
