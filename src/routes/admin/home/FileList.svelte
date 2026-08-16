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
		<!-- A thumbnail, the key and metadata across, actions on the right. The
		     grid reflows via named areas: two rows on a phone (key over date,
		     dims and size dropped), one wide row at `md`. -->
		<ul class="flex flex-col gap-2">
			{#each files as file (file.key)}
				<li
					class="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-[var(--radius-ui-lg)] bg-surface px-3 py-2.5 transition-colors duration-150 ease-out [grid-template-areas:'thumb_key_actions'_'thumb_meta_actions'] hover:bg-surface-hover md:min-h-12 md:grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem_6.5rem_auto] md:gap-4 md:px-3.5 md:[grid-template-areas:'thumb_key_dims_size_date_actions']"
				>
					{#if file.mime.startsWith('image/')}
						<img
							class="size-10 rounded-[var(--radius-inner)] bg-surface-sunken object-cover [grid-area:thumb]"
							src="{assetsOrigin}/{file.key}"
							alt=""
							width="40"
							height="40"
							loading="lazy"
						/>
					{:else}
						<span
							class="block size-10 rounded-[var(--radius-inner)] bg-surface-sunken [grid-area:thumb]"
							aria-hidden="true"
						></span>
					{/if}

					<code class="min-w-0 truncate text-xs [grid-area:key]">{file.key}</code>
					<span class="tnum hidden text-xs text-text-muted [grid-area:dims] md:block">
						{file.w && file.h ? `${file.w}×${file.h}` : '—'}
					</span>
					<span class="tnum hidden text-xs text-text-muted [grid-area:size] md:block">
						{fmtBytes(file.bytes)}
					</span>
					<span class="tnum text-xs text-text-muted [grid-area:meta] md:[grid-area:date] md:text-right">
						{fmtDate(file.at)}
					</span>

					<span class="flex flex-wrap justify-end gap-1 [grid-area:actions] md:flex-nowrap md:gap-2">
						<Button size="sm" variant="ghost" onclick={() => onInsert(file.key)}>
							Insert
						</Button>
						<Button size="sm" variant="ghost" onclick={() => onGallery(file.key)}>
							To gallery
						</Button>
						<form
							method="POST"
							action="?/deleteFile"
							class="contents"
							use:enhance={deleteSubmit(file.key)}
						>
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

