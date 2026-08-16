<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Button from '$lib/ui/Button.svelte';
	import Empty from '$lib/ui/Empty.svelte';
	import { fmtBytes, fmtDate, fmtDay } from '$lib/format';
	import { inputClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import FileForm from './FileForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);
	let copied = $state(false);

	const deleting = pending({ onSuccess: () => goto('/admin/files', { noScroll: true }) });

	// Deleting a file removes the bytes from R2 for good, so it asks first — the
	// same confirm the home asset list uses.
	const confirmDelete: import('@sveltejs/kit').SubmitFunction = (input) => {
		if (!confirm(`Delete ${data.selected?.name}? The bytes are removed from R2.`)) {
			input.cancel();
			return;
		}
		return deleting.submit(input);
	};

	let selection = $derived(page.url.searchParams.get('s'));
	let creating = $derived(selection === 'new');
	let detail = $derived(creating || Boolean(data.selected));

	let shareUrl = $derived(data.selected ? `${data.origin}/d/${data.selected.slug}` : '');

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(shareUrl);
		} catch {
			// Clipboard can be blocked; the field below is selectable anyway.
		}
		copied = true;
		setTimeout(() => (copied = false), 1600);
	};

	let visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return data.files;
		return data.files.filter(
			(f) => f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)
		);
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		const el = event.target as HTMLElement | null;
		if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;

		if (event.key === 'Escape' && detail) {
			event.preventDefault();
			goto('/admin/files', { noScroll: true });
		} else if (event.key === 'n') {
			event.preventDefault();
			goto('/admin/files?s=new', { noScroll: true });
		} else if (event.key === '/') {
			event.preventDefault();
			searchEl?.focus();
		}
	}
</script>

<svelte:head><title>Files</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<div class="layout" data-detail={detail || undefined}>
	<section class="list" aria-label="Files">
		<header class="mb-6 flex items-center justify-between gap-4">
			<h1 class="text-xl font-semibold">Files</h1>
			<Button href="/admin/files?s=new" variant="primary" size="sm" data-sveltekit-noscroll>
				<Plus size={15} aria-hidden="true" />
				Upload
			</Button>
		</header>

		{#if data.files.length}
			<div class="relative mb-3">
				<Search
					size={15}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
					aria-hidden="true"
				/>
				<input
					bind:this={searchEl}
					bind:value={query}
					type="search"
					placeholder="Search files"
					aria-label="Search files"
					class="{inputClass()} pl-9"
				/>
			</div>

			<p class="sr-only" role="status">
				{#if query.trim()}
					{visible.length}
					{visible.length === 1 ? 'file' : 'files'} match “{query.trim()}”
				{/if}
			</p>
		{/if}

		{#if form?.created}
			<p
				role="status"
				class="mb-3 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent"
			>
				Shared at ij5.dev/d/{form.created}.
			</p>
		{/if}

		{#if !data.files.length}
			<Empty
				title="No files yet"
				body="A file is shared at ij5.dev/d/… — upload it, send the link, and the recipient downloads it straight from the edge. Files can expire and the link never exposes the bucket."
			>
				{#snippet action()}
					<Button href="/admin/files?s=new" variant="primary" size="sm">Upload the first one</Button>
				{/snippet}
			</Empty>
		{:else if !visible.length}
			<Empty title="Nothing matches" body="No file is named “{query}”. Try a shorter search." />
		{:else}
			<ul class="rows">
				{#each visible as row (row.slug)}
					<li>
						<a
							href="/admin/files?s={row.slug}"
							data-sveltekit-noscroll
							aria-current={data.selected?.slug === row.slug ? 'true' : undefined}
							class="row"
						>
							<span class="row-name" title={row.name}>
								{row.name}
								{#if row.expired}
									<span class="badge">Expired</span>
								{/if}
							</span>

							<span class="row-slug">/d/{row.slug}</span>

							<span class="row-size tnum">{fmtBytes(row.bytes)}</span>

							<span class="row-dl tnum" title="Downloads">
								{row.downloads}
							</span>

							<span class="row-date tnum">{fmtDay(row.created_at)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<aside class="detail" aria-label="File details">
		<a href="/admin/files" data-sveltekit-noscroll class="back">
			<ChevronLeft size={16} aria-hidden="true" />
			All files
		</a>

		<div class="detail-pane">
			{#if creating}
				<h2 class="mb-5 text-lg font-semibold">Share a file</h2>
				<FileForm
					fields={form?.intent === 'create' ? form.fields : undefined}
					values={form?.intent === 'create' ? form.values : undefined}
					error={form?.error}
					onDone={() => goto('/admin/files', { noScroll: true })}
				/>
			{:else if data.selected}
				<h2 class="mb-1 text-lg font-semibold" title={data.selected.name}>
					{data.selected.name}
				</h2>
				<p class="mb-4 text-xs text-text-muted">
					{fmtBytes(data.selected.bytes)} · {fmtDate(data.selected.created_at)}
					{data.selected.expires_at ? ` · expires ${fmtDate(data.selected.expires_at)}` : ''}
					{data.selected.expired ? ' · expired' : ''}
					{' '}· {data.selected.downloads}{data.selected.downloads === 1 ? ' download' : ' downloads'}
				</p>

				<label for="link" class="text-sm font-medium">Share link</label>
				<div class="mt-1.5 flex items-center gap-2">
					<input
						id="link"
						readonly
						value={shareUrl}
						onclick={(e) => e.currentTarget.select()}
						spellcheck="false"
						class="{inputClass()} font-mono text-xs"
					/>
					<Button variant="secondary" size="sm" onclick={copyLink}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
				</div>

				<p class="mt-3 break-words text-xs text-text-subtle">
					<a
						href="/d/{data.selected.slug}"
						class="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-current"
					>
						Preview the page
					</a>
				</p>

				<form
					method="POST"
					action="?/delete"
					class="mt-6 border-t border-border-subtle pt-5"
					use:enhance={confirmDelete}
				>
					<input type="hidden" name="slug" value={data.selected.slug} />
					<div class="flex items-center justify-between gap-4">
						<p class="text-xs text-pretty text-text-muted">
							Deleting removes the bytes from R2. The link stops resolving immediately.
						</p>
						<Button type="submit" variant="danger" size="sm" busy={deleting.busy} busyLabel="Deleting…">
							Delete
						</Button>
					</div>
				</form>
			{:else}
				<p class="text-sm text-text-muted">
					Select a file to copy its link or delete it, or press <kbd class="kbd">n</kbd> to upload.
				</p>
			{/if}
		</div>
	</aside>
</div>

<style>
	.layout {
		display: grid;
		gap: 2rem;
	}

	.layout[data-detail] .list {
		display: none;
	}

	.layout:not([data-detail]) .detail {
		display: none;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 2.75rem;
		margin-block: -0.5rem 0.25rem;
		margin-inline-start: -0.25rem;
		padding-inline: 0.25rem;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-muted);
		transition: color 150ms var(--ease-out);
	}

	.back:hover {
		color: var(--text);
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.125rem 0.75rem;
		padding: 0.875rem 1rem;
		border-radius: var(--radius-ui-lg);
		background-color: var(--surface);
		transition:
			background-color 150ms var(--ease-out),
			scale 150ms var(--ease-out);
	}

	.row:active {
		scale: 0.99;
	}

	.row-name {
		grid-column: 1;
		font-size: var(--text-sm);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-name .badge {
		margin-inline-start: 0.5rem;
	}

	.row-slug {
		grid-column: 1;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.row-size,
	.row-dl {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		text-align: right;
	}

	.row-date {
		font-size: var(--text-xs);
		color: var(--text-muted);
		text-align: right;
	}

	.badge {
		border-radius: var(--radius-pill);
		background-color: var(--surface-sunken);
		padding: 0.0625rem 0.4375rem;
		font-size: var(--text-2xs);
		font-weight: 500;
		color: var(--text-muted);
	}

	.kbd {
		border-radius: 4px;
		background-color: var(--surface-sunken);
		padding: 0.0625rem 0.3125rem;
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
	}

	@media (min-width: 768px) {
		.row {
			grid-template-columns: minmax(0, 1.4fr) minmax(6rem, 1fr) 4.5rem 3rem 4rem;
			align-items: center;
			gap: 1rem;
			min-height: 2.5rem;
			padding-block: 0.625rem;
		}

		.row-name {
			grid-area: 1 / 1;
		}
		.row-slug {
			grid-area: 1 / 2;
		}
		.row-size {
			grid-area: 1 / 3;
		}
		.row-dl {
			grid-area: 1 / 4;
		}
		.row-date {
			grid-area: 1 / 5;
		}
	}

	@media (min-width: 1024px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 24rem;
			align-items: start;
		}

		.layout[data-detail] .list,
		.layout:not([data-detail]) .detail {
			display: block;
		}

		.back {
			display: none;
		}

		.detail {
			position: sticky;
			top: 2.5rem;
			border-radius: var(--radius-ui-lg);
			background-color: var(--surface);
			padding: 1.25rem;
		}
	}

	@media (max-width: 1023px) {
		.detail-pane {
			animation: pane-rise 180ms var(--ease-out);
		}
	}
	@keyframes pane-rise {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (hover: hover) and (pointer: fine) {
		.row:hover {
			background-color: var(--surface-hover);
		}
	}

	.row[aria-current='true'] {
		box-shadow: inset 0 0 0 1px var(--accent);
	}
</style>
