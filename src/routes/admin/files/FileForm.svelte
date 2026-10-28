<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Upload from 'lucide-svelte/icons/upload';
	import FileIcon from 'lucide-svelte/icons/file';
	import X from 'lucide-svelte/icons/x';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { affixClass, affixInput, affixPrefix, fieldClass, iconButton, notice } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { fmtBytes } from '$lib/format';
	import { MAX_FILE_BYTES } from '$lib/types';

	type Props = {
		fields?: Record<string, string>;
		values?: Record<string, string>;
		error?: string;
		/** After an upload, with the new file's slug. */
		onDone?: (slug?: string) => void;
	};

	let { fields = {}, values = {}, error, onDone }: Props = $props();

	let host = $derived(page.url.host);

	const saving = pending({
		reset: true,
		onSuccess: (data) => {
			chosen = null;
			onDone?.(String(data?.created ?? ''));
		}
	});

	let fileEl = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);
	let chosen = $state<{ name: string; size: number } | null>(null);
	let fileError = $state('');

	const LIMIT = `Files can be up to ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB.`;

	/** Validates a pick and, for a drop, hands the file to the real input —
	 *  the form only ever uploads what the `<input type="file">` holds, so a
	 *  dropped file that stayed in the drop zone used to upload nothing. */
	function pick(file: File | undefined | null, dropped = false) {
		if (!file) return;
		const problem = file.size > MAX_FILE_BYTES ? LIMIT : file.size === 0 ? 'That file is empty.' : '';
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
		chosen = { name: file.name, size: file.size };
	}

	function clear() {
		chosen = null;
		if (fileEl) fileEl.value = '';
	}

	const submit: SubmitFunction = (input) => {
		if (!chosen) {
			fileError = 'Choose a file.';
			input.cancel();
			return;
		}
		return saving.submit(input);
	};

	let problem = $derived(fileError || fields.file);
</script>

<form
	method="POST"
	action="?/create"
	enctype="multipart/form-data"
	class="flex flex-col gap-4 md:gap-5"
	use:enhance={submit}
>
	{#if error}
		<p role="alert" class={notice.error}>{error}</p>
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
					<span class="block text-xs text-text-muted">{fmtBytes(chosen.size)}</span>
				</span>
				<button type="button" onclick={clear} aria-label="Remove file" class={iconButton}>
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
				<span class="text-xs text-text-muted">Up to {(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB</span>
			</label>
		{/if}

		{#if problem}
			<p id="file-error" class="text-xs text-danger">{problem}</p>
		{/if}
	</div>

	<div class="grid gap-4 sm:grid-cols-2 md:gap-5">
		<Field id="slug" label="Link" error={fields.slug}>
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

		<Field id="expires" label="Expires" error={fields.expires}>
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
	</div>

	<div class="flex pt-2 md:justify-end md:border-t md:border-border-subtle md:pt-4">
		<Button type="submit" variant="primary" size="form" busy={saving.busy} busyLabel="Uploading…">
			Upload
		</Button>
	</div>
</form>
