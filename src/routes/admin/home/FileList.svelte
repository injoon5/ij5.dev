<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import TextCursorInput from 'lucide-svelte/icons/text-cursor-input';
	import LayoutGrid from 'lucide-svelte/icons/layout-grid';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import { cardTitle, iconButton } from '$lib/ui/styles';
	import { fmtBytes } from '$lib/format';
	import type { AssetRow } from '$lib/types';

	/**
	 * Every uploaded image, as a grid of thumbnails — these are pictures, and
	 * a list of hashed keys is the least recognisable way to show one. `files`
	 * is owned by the parent (uploads from the editor append to it). Insert
	 * and add-to-gallery are callbacks because both act at the editor's
	 * cursor; delete is a server form that checks nothing still uses it.
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

	const deleteSubmit =
		(key: string): SubmitFunction =>
		(input) => {
			if (!confirm('Delete this image? This can’t be undone.')) {
				input.cancel();
				return;
			}
			error = '';
			deleting[key] = true;
			return async ({ result }) => {
				if (result.type === 'failure') {
					error =
						(result.data as { error?: string } | undefined)?.error ?? 'That image could not be deleted.';
				} else if (result.type === 'success') {
					files = files.filter((f) => f.key !== key);
				}
				deleting[key] = false;
			};
		};
</script>

<section class="min-w-0">
	<h2 class="{cardTitle} mb-3">Images</h2>

	{#if error}
		<p role="alert" class="mb-3 text-xs text-danger">{error}</p>
	{/if}

	{#if files.length}
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
			{#each files as file (file.key)}
				<li
					class="overflow-hidden rounded-[var(--radius-ui-lg)] bg-surface md:shadow-[0_0_0_1px_var(--border-subtle)] {deleting[
						file.key
					]
						? 'opacity-50'
						: ''} transition-opacity duration-150 ease-out"
				>
					<img
						class="aspect-[4/3] w-full bg-surface-sunken object-cover"
						src="{assetsOrigin}/{file.key}"
						alt=""
						width={file.w ?? undefined}
						height={file.h ?? undefined}
						loading="lazy"
						decoding="async"
					/>
					<div class="flex items-center gap-1 border-t border-[var(--img-outline)] py-1 ps-3 pe-1">
						<p class="min-w-0 flex-1 truncate text-xs text-text-muted" title={file.key}>
							{file.w && file.h ? `${file.w}×${file.h} · ` : ''}{fmtBytes(file.bytes)}
						</p>
						<button
							type="button"
							class={iconButton}
							onclick={() => onInsert(file.key)}
							aria-label="Insert into page"
							title="Insert into page"
						>
							<TextCursorInput size={15} aria-hidden="true" />
						</button>
						<button
							type="button"
							class={iconButton}
							onclick={() => onGallery(file.key)}
							aria-label="Add to gallery"
							title="Add to gallery"
						>
							<LayoutGrid size={15} aria-hidden="true" />
						</button>
						<form method="POST" action="?/deleteFile" class="contents" use:enhance={deleteSubmit(file.key)}>
							<input type="hidden" name="key" value={file.key} />
							<button
								type="submit"
								class="{iconButton} hover:text-danger"
								disabled={deleting[file.key]}
								aria-label="Delete image"
								title="Delete image"
							>
								<Trash2 size={15} aria-hidden="true" />
							</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-text-muted">
			Images you add to the page appear here.
		</p>
	{/if}
</section>
