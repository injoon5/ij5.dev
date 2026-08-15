<script lang="ts">
	import { enhance } from '$app/forms';
	import Upload from 'lucide-svelte/icons/upload';
	import X from 'lucide-svelte/icons/x';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { fmtBytes } from '$lib/format';
	import { MAX_FILE_BYTES } from '$lib/types';

	type Props = {
		fields?: Record<string, string>;
		values?: Record<string, string>;
		error?: string;
		onDone?: () => void;
	};

	let { fields = {}, values = {}, error, onDone }: Props = $props();

	const saving = pending({ reset: true, onSuccess: () => onDone?.() });

	let fileEl = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);
	let chosen = $state<{ name: string; size: number } | null>(null);
	let fileError = $state('');

	function pick(file: File | undefined | null) {
		if (!file) return;
		if (file.size > MAX_FILE_BYTES) {
			// The input keeps nothing on error so a corrected pick starts clean.
			chosen = null;
			fileError = `Files are capped at ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB.`;
			if (fileEl) fileEl.value = '';
			return;
		}
		if (file.size === 0) {
			chosen = null;
			fileError = 'That file is empty.';
			if (fileEl) fileEl.value = '';
			return;
		}
		fileError = '';
		chosen = { name: file.name, size: file.size };
	}
</script>

<form
	method="POST"
	action="?/create"
	enctype="multipart/form-data"
	class="flex flex-col gap-4"
	use:enhance={saving.submit}
>
	{#if error}
		<p class="rounded-[var(--radius-ui)] bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
	{/if}

	<Field id="file" label="File" error={fields.file}>
		{#snippet children({ id, describedBy, invalid })}
			<div class="flex flex-col gap-2">
				<input
					{id}
					name="file"
					type="file"
					aria-describedby={describedBy}
					aria-invalid={invalid || Boolean(fileError) || undefined}
					class="sr-only"
					onchange={(e) => pick(e.currentTarget.files?.[0])}
				/>

				{#if chosen}
					<div class="flex items-center gap-2 rounded-[var(--radius-ui)] bg-surface px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
						<p class="min-w-0 flex-1 truncate font-mono text-sm">{chosen.name}</p>
						<p class="tnum shrink-0 text-xs text-text-muted">{fmtBytes(chosen.size)}</p>
						<button
							type="button"
							onclick={() => {
								chosen = null;
								if (fileEl) fileEl.value = '';
							}}
							aria-label="Remove file"
							class="grid size-8 shrink-0 place-items-center rounded-[var(--radius-ui)] text-text-subtle transition-colors duration-150 ease-out hover:bg-surface-sunken hover:text-text"
						>
							<X size={14} aria-hidden="true" />
						</button>
					</div>
				{/if}

				<div
					class="dropzone"
					class:dragging
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragging = false;
						pick(e.dataTransfer?.files?.[0]);
					}}
					role="presentation"
				>
					<button
						type="button"
						onclick={() => fileEl?.click()}
						class="flex min-h-11 w-full items-center justify-center gap-2 text-xs text-text-muted transition-colors duration-150 ease-out hover:text-text pointer-fine:min-h-9"
					>
						<Upload size={14} aria-hidden="true" />
						Choose a file<span class="hidden sm:inline"> or drop one here</span>
					</button>
				</div>

				{#if fileError}
					<p class="text-xs text-danger">{fileError}</p>
				{/if}
			</div>
		{/snippet}
	</Field>

	<div class="grid gap-4 sm:grid-cols-2">
		<Field
			id="slug"
			label="Slug"
			optional
			error={fields.slug}
			hint="Leave blank for a random one."
		>
			{#snippet children({ id, describedBy, invalid })}
				<div class="flex items-center gap-2">
					<span class="text-sm text-text-subtle">ij5.dev/d/</span>
					<input
						{id}
						name="slug"
						value={values.slug ?? ''}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						spellcheck="false"
						autocapitalize="off"
						autocorrect="off"
						placeholder="auto"
						class={fieldClass(invalid)}
					/>
				</div>
			{/snippet}
		</Field>

		<Field id="expires" label="Expires" optional error={fields.expires}>
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

	<Button type="submit" variant="primary" busy={saving.busy} busyLabel="Uploading…">
		Upload file
	</Button>
</form>

<style>
	.dropzone {
		border-radius: var(--radius-ui);
		border: 1px dashed var(--border-subtle);
		transition:
			border-color 150ms var(--ease-out),
			background-color 150ms var(--ease-out);
	}

	.dropzone.dragging {
		border-color: var(--accent);
		background-color: var(--accent-tint);
	}
</style>
