<script lang="ts">
	import { enhance } from '$app/forms';
	import Rocket from 'lucide-svelte/icons/rocket';
	import Undo from 'lucide-svelte/icons/undo-2';
	import ImagePlus from 'lucide-svelte/icons/image-plus';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import AssetInput from '$lib/ui/AssetInput.svelte';
	import { card, fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { serializeLines } from '$lib/lines';
	import { renderMarkdown } from '$lib/markdown';
	import { uploadImage } from '$lib/ui/upload';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The editing buffer. Seeded once from the draft; a save round-trip does not
	// overwrite what someone is still typing.
	// svelte-ignore state_referenced_locally
	let content = $state(data.draft.markdown ?? '');
	let textarea = $state<HTMLTextAreaElement | null>(null);
	let uploadEl = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);
	let uploadError = $state('');

	// The same renderer the public page uses, run in the browser. Live data
	// (the contribution graph) shows its empty-lattice fallback in preview.
	let preview = $derived(renderMarkdown(content, { assetsOrigin: data.assetsOrigin }).html);

	let linksValue = $derived(
		serializeLines(data.draft.profile.links as unknown as Array<Record<string, unknown>>, [
			'label',
			'href',
			'icon'
		])
	);

	const publishing = pending();
	const reverting = pending();
	const savingProfile = pending();
	const savingContent = pending();

	function insertAtCursor(snippet: string) {
		const el = textarea;
		if (!el) {
			content += snippet;
			return;
		}
		const start = el.selectionStart ?? content.length;
		const end = el.selectionEnd ?? content.length;
		content = content.slice(0, start) + snippet + content.slice(end);
		queueMicrotask(() => {
			el.focus();
			const pos = start + snippet.length;
			el.setSelectionRange(pos, pos);
		});
	}

	async function uploadFile(file: File) {
		uploading = true;
		uploadError = '';
		try {
			const { key } = await uploadImage(file);
			const alt = file.name.replace(/\.[^.]+$/, '');
			insertAtCursor(`\n\n![${alt}](${key})\n\n`);
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Upload failed.';
		} finally {
			uploading = false;
		}
	}

	function onPaste(event: ClipboardEvent) {
		const item = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
		const file = item?.getAsFile();
		if (file) {
			event.preventDefault();
			uploadFile(file);
		}
	}

	function onDrop(event: DragEvent) {
		const file = event.dataTransfer?.files?.[0];
		if (file?.type.startsWith('image/')) {
			event.preventDefault();
			uploadFile(file);
		}
	}
</script>

<svelte:head><title>Home</title></svelte:head>

<header class="mb-6 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h1 class="text-xl font-semibold">Home</h1>
		<p class="mt-0.5 text-xs text-text-muted">
			{#if data.dirty}
				Draft has unpublished changes · live version {data.publishedVersion}
			{:else}
				Published · version {data.publishedVersion}
			{/if}
		</p>
	</div>

	<div class="flex items-center gap-2">
		{#if data.canRevert}
			<form method="POST" action="?/revert" use:enhance={reverting.submit}>
				<Button type="submit" variant="ghost" size="sm" busy={reverting.busy} busyLabel="Reverting…">
					<Undo size={14} aria-hidden="true" />
					Revert
				</Button>
			</form>
		{/if}

		<form method="POST" action="?/publish" use:enhance={publishing.submit}>
			<Button
				type="submit"
				variant="primary"
				size="sm"
				disabled={!data.dirty}
				busy={publishing.busy}
				busyLabel="Publishing…"
			>
				<Rocket size={14} aria-hidden="true" />
				Publish
			</Button>
		</form>
	</div>
</header>

{#if form?.published}
	<p role="status" class="mb-4 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent">
		Version {form.published} is live everywhere.
	</p>
{:else if form?.reverted}
	<p role="status" class="mb-4 rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent">
		Rolled back. Version {form.reverted} is live.
	</p>
{:else if form?.error}
	<p role="alert" class="mb-4 rounded-[var(--radius-ui)] bg-danger-tint px-3 py-2 text-sm text-danger">
		{form.error}
	</p>
{/if}

<div class="editor">
	<!-- The masthead fields. Not part of the Markdown body: always present,
	     always first, so they get their own record and their own form. -->
	<section class="{card}">
		<h2 class="text-sm font-semibold">Identity</h2>

		<form
			method="POST"
			action="?/profile"
			class="mt-3 flex flex-col gap-4"
			use:enhance={savingProfile.submit}
		>
			<Field id="p-name" label="Name" error={form?.intent === 'profile' ? form.fields?.name : undefined}>
				{#snippet children({ id, describedBy, invalid })}
					<input {id} name="name" value={data.draft.profile.name} aria-describedby={describedBy} aria-invalid={invalid || undefined} required class={fieldClass(invalid)} />
				{/snippet}
			</Field>

			<Field id="p-tagline" label="Tagline" optional hint="One line under your name.">
				{#snippet children({ id, describedBy, invalid })}
					<input {id} name="tagline" value={data.draft.profile.tagline ?? ''} aria-describedby={describedBy} aria-invalid={invalid || undefined} class={fieldClass(invalid)} />
				{/snippet}
			</Field>

			<Field id="p-avatar" label="Avatar" optional>
				{#snippet children({ id, describedBy })}
					<AssetInput {id} name="avatar" value={data.draft.profile.avatar ?? ''} assetsOrigin={data.assetsOrigin} {describedBy} />
				{/snippet}
			</Field>

			<Field
				id="p-links"
				label="Quick links"
				optional
				hint="For the :::links buttons. One per line: icon | label | url. Icons: github, x, linkedin, instagram, youtube, mail, rss, globe."
			>
				{#snippet children({ id, describedBy, invalid })}
					<textarea
						{id}
						name="links"
						rows="4"
						value={linksValue}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						spellcheck="false"
						class="{fieldClass(invalid)} resize-y font-mono text-xs"
					></textarea>
				{/snippet}
			</Field>

			<div>
				<Button type="submit" variant="secondary" size="sm" busy={savingProfile.busy} busyLabel="Saving…">
					Save identity
				</Button>
			</div>
		</form>
	</section>

	<section class="min-w-0">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-sm font-semibold">Page</h2>
			<Button
				variant="secondary"
				size="sm"
				onclick={() => uploadEl?.click()}
				busy={uploading}
				busyLabel="Uploading…"
			>
				<ImagePlus size={14} aria-hidden="true" />
				Insert image
			</Button>
		</div>

		{#if uploadError}
			<p role="alert" class="mb-2 text-xs text-danger">{uploadError}</p>
		{/if}

		<input
			bind:this={uploadEl}
			type="file"
			accept="image/png,image/jpeg,image/webp,image/avif"
			class="sr-only"
			onchange={(e) => {
				const file = e.currentTarget.files?.[0];
				if (file) uploadFile(file);
				e.currentTarget.value = '';
			}}
		/>

		<div class="panes">
			<form method="POST" action="?/save" class="pane" use:enhance={savingContent.submit}>
				<!-- Drop or paste an image straight onto the text to upload and
				     insert it at the cursor. -->
				<textarea
					bind:this={textarea}
					bind:value={content}
					name="content"
					spellcheck="false"
					onpaste={onPaste}
					ondrop={onDrop}
					ondragover={(e) => e.preventDefault()}
					class="editor-area"
					aria-label="Page Markdown"
				></textarea>

				<div class="mt-3 flex flex-wrap items-center gap-2">
					<Button type="submit" variant="secondary" size="sm" busy={savingContent.busy} busyLabel="Saving…">
						Save draft
					</Button>
					<span class="text-xs text-text-subtle">
						Markdown, plus <code>:::links</code>, <code>:github:</code>, <code>::contributions</code>.
					</span>
				</div>
			</form>

			<div class="pane preview" aria-label="Preview">
				<article class="prose">{@html preview}</article>
			</div>
		</div>
	</section>
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.panes {
		display: grid;
		gap: 1rem;
	}

	.editor-area {
		width: 100%;
		min-height: 60vh;
		padding: 1rem 1.1rem;
		border-radius: var(--radius-ui);
		background-color: var(--surface);
		box-shadow: inset 0 0 0 1px var(--border-subtle);
		font-family: var(--font-mono);
		/* 16px on a phone so iOS does not zoom the field on focus. */
		font-size: 16px;
		line-height: 1.7;
		resize: vertical;
		transition: box-shadow 150ms var(--ease-out);
	}
	.editor-area:focus {
		outline: none;
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.preview {
		min-height: 60vh;
		max-height: 80vh;
		padding: 1.75rem;
		border-radius: var(--radius-ui);
		background-color: var(--surface);
		box-shadow: inset 0 0 0 1px var(--border-subtle);
		overflow: auto;
	}

	@media (min-width: 640px) {
		.editor-area {
			font-size: 13px;
		}
	}

	@media (min-width: 1024px) {
		.panes {
			grid-template-columns: 1fr 1fr;
			align-items: start;
		}
	}
</style>
