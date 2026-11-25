<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Plus from 'lucide-svelte/icons/plus';
	import Button from '$lib/ui/Button.svelte';
	import DetailHeader from '$lib/ui/DetailHeader.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import MasterDetail from '$lib/ui/MasterDetail.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import SearchField from '$lib/ui/SearchField.svelte';
	import { fmtDay } from '$lib/format';
	import { listShortcuts } from '$lib/ui/shortcuts';
	import { badge, kbd, rowTitle, table, tableHead, tableRow } from '$lib/ui/styles';
	import AppForm from './AppForm.svelte';
	import AppTile from './AppTile.svelte';
	import DataTab from './DataTab.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);

	let creating = $derived(page.url.searchParams.get('s') === 'new');
	let open = $derived(creating || Boolean(data.selected));
	let tab = $derived(page.url.searchParams.get('tab') === 'data' ? 'data' : 'app');

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.apps;
		return data.apps.filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
	});

	const cols = 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4.5rem]';

	const segment =
		'flex items-center rounded-[calc(var(--radius-ui)-3px)] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-text-muted transition-[background-color,color] duration-150 ease-out hover:text-text aria-[current=true]:bg-surface aria-[current=true]:text-text aria-[current=true]:shadow-[0_1px_2px_oklch(0_0_0/0.08),0_0_0_1px_var(--border-subtle)] max-md:flex-1 max-md:justify-center pointer-coarse:min-h-9';

	const onkeydown = listShortcuts('/admin/apps', () => ({ open, search: searchEl }));

	let saveForm = $derived(form?.intent === 'save' ? form : undefined);
	let dataForm = $derived(form?.intent === 'data' ? form : undefined);
</script>

<svelte:head><title>Apps</title></svelte:head>
<svelte:window {onkeydown} />

<MasterDetail {open} label="App">
	{#snippet list()}
		<PageHeader title="Apps">
			{#snippet actions()}
				<Button href="/admin/apps?s=new" variant="primary" size="sm" data-sveltekit-noscroll>
					<Plus size={15} aria-hidden="true" />
					New app
				</Button>
			{/snippet}
		</PageHeader>

		{#if !data.apps.length}
			<Empty title="No apps yet" body="Paste a reply from a chat model, or install one from Shelf on the phone.">
				{#snippet action()}
					<Button href="/admin/apps?s=new" variant="primary" size="sm">New app</Button>
				{/snippet}
			</Empty>
		{:else}
			<div class="px-4 py-3 md:px-6">
				<SearchField bind:value={query} bind:el={searchEl} label="Search apps" />
			</div>

			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'app matches' : 'apps match'} “{query.trim()}”
				{/if}
			</p>

			{#if !visible.length}
				<Empty title="No apps match “{query.trim()}”" />
			{:else}
				<div class={table}>
					<div class="{tableHead} {cols}" aria-hidden="true">
						<span>App</span>
						<span>Slug</span>
						<span class="text-right">Updated</span>
					</div>
					<ul>
						{#each visible as row (row.slug)}
							<li>
								<a
									href="/admin/apps?s={encodeURIComponent(row.slug)}"
									data-sveltekit-noscroll
									aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
									class="{tableRow} {cols}"
								>
									<span class="flex min-w-0 items-center gap-2.5 {rowTitle}">
										<AppTile name={row.name} tint={row.tint} size={24} />
										<span class="truncate">{row.name}</span>
									</span>

									<span
										class="col-start-1 truncate ps-[2.125rem] font-mono text-xs text-text-muted md:col-start-auto md:ps-0"
									>
										{row.slug}
									</span>

									<span
										class="col-start-2 row-start-1 text-right text-xs text-text-subtle md:col-start-auto md:row-start-auto md:text-sm md:text-text-muted"
									>
										{fmtDay(row.updated_at)}
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
			<DetailHeader title="New app" close="/admin/apps" backLabel="Apps" />
			<div class="p-4 md:p-5">
				<AppForm
					app={null}
					fields={saveForm?.fields}
					values={saveForm?.values}
					error={saveForm?.error}
					onDone={(slug) =>
						goto(slug ? `/admin/apps?s=${encodeURIComponent(slug)}` : '/admin/apps', { noScroll: true })}
				/>
			</div>
		{:else if data.selected}
			{@const app = data.selected}
			{@const href = (t: string) => `/admin/apps?s=${encodeURIComponent(app.slug)}${t === 'data' ? '&tab=data' : ''}`}
			<DetailHeader title={app.name} close="/admin/apps" backLabel="Apps" />
			<div class="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 md:px-5">
				<div class="flex gap-0.5 rounded-[var(--radius-ui)] bg-surface-sunken p-[3px] max-md:flex-1" role="group" aria-label="Section">
					<a href={href('app')} data-sveltekit-noscroll aria-current={tab === 'app' ? 'true' : undefined} class={segment}>
						App
					</a>
					<a href={href('data')} data-sveltekit-noscroll aria-current={tab === 'data' ? 'true' : undefined} class={segment}>
						Data
						{#if data.entries.length}
							<span class="ms-1 text-text-subtle tabular-nums">{data.entries.length}</span>
						{/if}
					</a>
				</div>
				{#if data.versions.length}
					<span class="{badge} ms-auto max-md:hidden" title="Earlier versions kept for Revert">
						{data.versions.length} earlier
					</span>
				{/if}
			</div>
			<div class="p-4 md:p-5">
				{#key app.slug}
					{#if tab === 'data'}
						<DataTab
							slug={app.slug}
							entries={data.entries}
							value={data.value}
							fields={dataForm?.fields}
							echo={dataForm && 'key' in dataForm ? { key: dataForm.key, value: dataForm.value } : undefined}
							error={dataForm?.error}
						/>
					{:else}
						<AppForm
							{app}
							dataKeys={data.entries.length}
							fields={saveForm?.fields}
							values={saveForm?.values}
							error={saveForm?.error ?? (form?.intent === 'revert' || form?.intent === 'delete' ? form.error : undefined)}
							onDone={() => goto('/admin/apps', { noScroll: true })}
						/>
					{/if}
				{/key}
			</div>
		{:else}
			<div class="grid h-full min-h-40 place-items-center p-8 text-center max-lg:hidden">
				<p class="text-sm text-text-muted">
					Select an app, or press <kbd class={kbd}>N</kbd> to paste a new one.
				</p>
			</div>
		{/if}
	{/snippet}
</MasterDetail>
