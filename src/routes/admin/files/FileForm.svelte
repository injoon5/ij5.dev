<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Upload from 'lucide-svelte/icons/upload';
	import FileIcon from 'lucide-svelte/icons/file';
	import X from 'lucide-svelte/icons/x';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { affixClass, affixInput, affixPrefix, fieldClass, iconButton, notice } from '$lib/ui/styles';
	import { FieldError, uploadFile } from '$lib/ui/multipart';
	import { fmtBytes } from '$lib/format';

	type Props = {
		/** The largest file this deployment accepts (`$lib/uploads`). */
		maxFileBytes: number;
		fields?: Record<string, string>;
		values?: Record<string, string>;
		error?: string;
		/** After an upload, with the new file's slug. */
		onDone?: (slug?: string) => void;
	};

	let { maxFileBytes, fields = {}, values = {}, error, onDone }: Props = $props();

	let host = $derived(page.url.host);

	let fileEl = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);
	let chosen = $state<File | null>(null);
	let fileError = $state('');

	// The upload in flight: its progress, the way to stop it, and what it
	// came back with when it failed.
	let uploading = $state(false);
	let loaded = $state(0);
	let controller: AbortController | null = null;
	let uploadError = $state('');
	let uploadFields = $state<Record<string, string>>({});

	let percent = $derived(chosen && chosen.size ? Math.min(100, Math.floor((loaded / chosen.size) * 100)) : 0);
	let allFields = $derived({ ...fields, ...uploadFields });
	let problem = $derived(fileError || allFields.file);

	/** Validates a pick and, for a drop, hands the file to the real input so
	 *  the no-JS form post would carry it too. */
	function pick(file: File | undefined | null, dropped = false) {
		if (!file) return;
		const tooBig = file.size > maxFileBytes ? `Files can be up to ${fmtBytes(maxFileBytes)}.` : '';
		const problem = tooBig || (file.size === 0 ? 'That file is empty.' : '');
		if (problem) {
			chosen = null;
			fileError = problem;
			if (fileEl) fileEl.value = '';
			return;
		}
		if (dropped && fileEl) {
			const transfer = new DataTransfer();
			transfer.items.add(file);
			fileEl.files = transfer.files;
		}
		fileError = '';
		uploadError = '';
		uploadFields = {};
		chosen = file;
	}

	function clear() {
		if (uploading) {
			controller?.abort();
			return;
		}
		chosen = null;
		if (fileEl) fileEl.value = '';
	}

	/**
	 * With JavaScript the file never rides the form post: it is streamed to R2
	 * in parts, which is what lifts the limit from a request body to
	 * `maxFileBytes`. The form's own action stays for a browser without it.
	 */
	const submit: SubmitFunction = ({ cancel, formData }) => {
		cancel();
		if (!chosen || uploading) {
			if (!chosen) fileError = 'Choose a file.';
			return;
		}
		send(chosen, String(formData.get('slug') ?? ''), String(formData.get('expires') ?? ''));
	};

	async function send(file: File, slug: string, expires: string) {
		uploading = true;
		loaded = 0;
		uploadError = '';
		uploadFields = {};
		controller = new AbortController();
		try {
			const result = await uploadFile(file, {
				slug: slug.trim() || undefined,
				expires,
				signal: controller.signal,
				onProgress: (n) => (loaded = n)
			});
			chosen = null;
			if (fileEl) fileEl.value = '';
			onDone?.(result.slug);
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			if (e instanceof FieldError) uploadFields = e.fields;
			else uploadError = e instanceof Error ? e.message : 'The upload failed.';
		} finally {
			uploading = false;
			loaded = 0;
			controller = null;
		}
	}

	// Leaving mid-upload cancels it, so it asks first.
	beforeNavigate(({ cancel, type }) => {
		if (!uploading || type === 'leave') return;
		if (confirm('Leave and cancel the upload?')) controller?.abort();
		else cancel();
	});

	function onbeforeunload(event: BeforeUnloadEvent) {
		if (uploading) event.preventDefault();
	}
</script>

<svelte:window {onbeforeunload} />

<form
	method="POST"
	action="?/create"
	enctype="multipart/form-data"
	class="flex flex-col gap-4 md:gap-5"
	use:enhance={submit}
>
	{#if error || uploadError}
		<p role="alert" class={notice.error}>{error || uploadError}</p>
	{/if}

	<div class="flex flex-col gap-1.5">
		<input
			bind:this={fileEl}
			id="file"
			name="file"
			type="file"
			aria-invalid={Boolean(problem) || undefined}
			aria-describedby={problem ? 'file-error' : undefined}
			class="sr-only"
			onchange={(e) => pick(e.currentTarget.files?.[0])}
		/>

		{#if chosen}
			<div
				class="flex items-center gap-3 rounded-[var(--radius-ui-lg)] bg-surface py-2.5 ps-3 pe-1.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]"
			>
				<span
					class="grid size-9 shrink-0 place-items-center rounded-[var(--radius-ui-sm)] bg-surface-sunken text-text-muted"
					aria-hidden="true"
				>
					<FileIcon size={16} />
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-medium">{chosen.name}</span>
					<span class="tnum block text-xs text-text-muted" aria-live="polite">
						{#if uploading}
							{percent}% · {fmtBytes(loaded)} of {fmtBytes(chosen.size)}
						{:else}
							{fmtBytes(chosen.size)}
						{/if}
					</span>
					{#if uploading}
						<!-- Width, not a transform: it moves a few times a second
						     and must never overshoot what has actually arrived. -->
						<span
							class="mt-2 block h-1 overflow-hidden rounded-full bg-row-active"
							role="progressbar"
							aria-label="Upload progress"
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={percent}
						>
							<span
								class="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
								style="width: {percent}%"
							></span>
						</span>
					{/if}
				</span>
				<button
					type="button"
					onclick={clear}
					aria-label={uploading ? 'Cancel upload' : 'Remove file'}
					title={uploading ? 'Cancel upload' : 'Remove file'}
					class={iconButton}
				>
					<X size={15} aria-hidden="true" />
				</button>
			</div>
		{:else}
			<!-- The whole zone is the button: tap to pick on a phone, drop onto it
			     with a mouse. -->
			<label
				for="file"
				class="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-ui-lg)] border border-dashed px-4 text-center transition-[border-color,background-color] duration-150 ease-out {dragging
					? 'border-accent bg-accent-tint'
					: problem
						? 'border-danger bg-surface'
						: 'border-border-strong bg-surface hover:bg-row-hover'}"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(e) => {
					e.preventDefault();
					dragging = false;
					pick(e.dataTransfer?.files?.[0], true);
				}}
			>
				<span
					class="grid size-10 place-items-center rounded-full bg-surface-sunken text-text-muted"
					aria-hidden="true"
				>
					<Upload size={18} />
				</span>
				<span class="text-sm font-medium">
					Choose a file<span class="pointer-coarse:hidden">&nbsp;or drop it here</span>
				</span>
				<span class="text-xs text-text-muted">Up to {fmtBytes(maxFileBytes)}</span>
			</label>
		{/if}

		{#if problem}
			<p id="file-error" class="text-xs text-danger">{problem}</p>
		{/if}
	</div>

	<!-- Locked while uploading: the name was claimed when the upload began,
	     so an edit now would be silently ignored. -->
	<fieldset disabled={uploading} class="grid gap-4 disabled:opacity-60 sm:grid-cols-2 md:gap-5">
		<Field id="slug" label="Link" error={allFields.slug}>
			{#snippet children({ id, describedBy, invalid })}
				<div class={affixClass(invalid)}>
					<span class={affixPrefix} aria-hidden="true">{host}/d/</span>
					<input
						{id}
						name="slug"
						value={values.slug ?? ''}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						spellcheck="false"
						autocapitalize="off"
						autocorrect="off"
						autocomplete="off"
						placeholder="random"
						class={affixInput}
					/>
				</div>
			{/snippet}
		</Field>

		<Field id="expires" label="Expires" error={allFields.expires}>
			{#snippet children({ id, describedBy, invalid })}
				<input
					{id}
					name="expires"
					type="date"
					value={values.expires ?? ''}
					aria-describedby={describedBy}
					class={fieldClass(invalid)}
				/>
			{/snippet}
		</Field>
	</fieldset>

	<div class="flex pt-2 md:justify-end md:border-t md:border-border-subtle md:pt-4">
		<Button type="submit" variant="primary" size="form" busy={uploading} busyLabel="Uploading…">
			Upload
		</Button>
	</div>
</form>
