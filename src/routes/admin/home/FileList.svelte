<script lang="ts">
	import { enhance } from '$app/forms';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Button from '$lib/ui/Button.svelte';
	import { card } from '$lib/ui/styles';
	import { fmtBytes, fmtDate } from '$lib/format';
	import type { AssetRow } from '$lib/types';

	/**
	 * The uploaded-files list. `files` is owned by the parent (uploads from the
	 * editor append to it); delete is a server form that filters the local list
	 * on success and surfaces the error inline. "Insert" and "To gallery" are
	 * callbacks because inserting happens at the editor's cursor.
	 */

	let {
		files = $bindable(),
		assetsOrigin,
		onInsert,
		onGallery
	}: {
		files: AssetRow[];
		assetsOrigin: string;
		onInsert: (key: string) => void;
		onGallery: (key: string) => void;
	} = $props();

	let deleting = $state<Record<string, boolean>>({});
	let error = $state('');

	const deleteSubmit = (key: string): import('@sveltejs/kit').SubmitFunction => (input) => {
		if (!confirm(`Delete ${key}?`)) {
			input.cancel();
			return;
		}
		error = '';
		deleting[key] = true;
		return async ({ result }) => {
			if (result.type === 'failure') {
				error = (result.data as { error?: string } | undefined)?.error ?? 'Could not delete that file.';
			} else if (result.type === 'success') {
				files = files.filter((f) => f.key !== key);
			}
			deleting[key] = false;
		};
	};
</script>

<section class="min-w-0">
	<div class="mb-3 flex items-center justify-between gap-3">
		<h2 class="text-sm font-semibold">Files</h2>
		<span class="tnum text-xs text-text-muted">
			{files.length} {files.length === 1 ? 'file' : 'files'}
		</span>
	</div>

	{#if error}
		<p role="alert" class="mb-2 text-xs text-danger">{error}</p>
	{/if}

	{#if files.length}
		<ul class="files">
			{#each files as file (file.key)}
				<li class="file">
					{#if file.mime.startsWith('image/')}
						<img
							class="file-thumb"
							src="{assetsOrigin}/{file.key}"
							alt=""
							width="40"
							height="40"
							loading="lazy"
						/>
					{:else}
						<span class="file-thumb file-thumb--blank" aria-hidden="true"></span>
					{/if}

					<code class="file-key">{file.key}</code>
					<span class="file-dims tnum">{file.w && file.h ? `${file.w}×${file.h}` : '—'}</span>
					<span class="file-size tnum">{fmtBytes(file.bytes)}</span>
					<span class="file-date tnum">{fmtDate(file.at)}</span>

					<span class="file-actions">
						<Button size="sm" variant="ghost" onclick={() => onInsert(file.key)}>
							Insert
						</Button>
						<Button size="sm" variant="ghost" onclick={() => onGallery(file.key)}>
							To gallery
						</Button>
						<form method="POST" action="?/deleteFile" use:enhance={deleteSubmit(file.key)}>
							<Button
								type="submit"
								size="sm"
								variant="ghost"
								busy={deleting[file.key]}
								busyLabel="Deleting…"
								aria-label={`Delete ${file.key}`}
							>
								<Trash2 size={14} aria-hidden="true" />
								Delete
							</Button>
						</form>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="{card}">
			<p class="text-sm text-text-muted">
				Nothing uploaded yet. Insert an image from the editor above, or drop one straight onto the
				page text.
			</p>
		</div>
	{/if}
</section>

<style>
	/* The uploaded-files list. A row list like the Links table: one surface
	   per file, a thumbnail on the left, metadata across, actions on the
	   right. The grid shrinks its columns below `md` so the key and actions
	   stay on one row on a phone. */
	.files {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.file {
		display: grid;
		grid-template-columns: 2.5rem minmax(0, 1fr) auto;
		grid-template-areas:
			'thumb key actions'
			'thumb meta actions';
		align-items: center;
		gap: 0.125rem 0.75rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-ui-lg);
		background-color: var(--surface);
		transition: background-color 150ms var(--ease-out);
	}

	.file-thumb {
		grid-area: thumb;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-inner);
		background-color: var(--surface-sunken);
		object-fit: cover;
	}

	.file-thumb--blank {
		display: block;
	}

	.file-key {
		grid-area: key;
		min-width: 0;
		font-size: var(--text-xs);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* On a phone the key gets the top row and the date the line under it.
	   Dims and size are the columns a phone does not need. */
	.file-dims,
	.file-size,
	.file-date {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.file-dims,
	.file-size {
		display: none;
	}

	.file-date {
		grid-area: meta;
	}

	.file-actions {
		grid-area: actions;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.25rem;
	}

	.file-actions form {
		display: contents;
	}

	@media (hover: hover) and (pointer: fine) {
		.file:hover {
			background-color: var(--surface-hover);
		}
	}

	@media (min-width: 768px) {
		.file {
			grid-template-columns: 2.5rem minmax(0, 1fr) 5rem 5rem 6.5rem auto;
			grid-template-areas: 'thumb key dims size date actions';
			gap: 1rem;
			min-height: 3rem;
			padding-inline: 0.875rem;
		}

		.file-dims,
		.file-size {
			display: block;
		}

		.file-dims {
			grid-area: dims;
		}

		.file-size {
			grid-area: size;
		}

		.file-date {
			grid-area: date;
			text-align: right;
		}

		.file-actions {
			grid-area: actions;
			flex-wrap: nowrap;
			gap: 0.5rem;
		}
	}
</style>
