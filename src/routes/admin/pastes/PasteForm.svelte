<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { MAX_PASTE_CHARS, type PasteRow } from '$lib/types';

	type Props = {
		/** `null` puts the form in create mode. */
		row: PasteRow | null;
		fields?: Record<string, string>;
		values?: Record<string, string>;
		error?: string;
		onDone?: () => void;
	};

	let { row, fields = {}, values = {}, error, onDone }: Props = $props();

	let mode = $derived(row ? 'update' : 'create');

	const saving = pending({
		reset: () => mode === 'create',
		onSuccess: () => onDone?.()
	});

	const deleting = pending({ onSuccess: () => onDone?.() });

	const iso = (ms: number | null | undefined) =>
		ms ? new Date(ms).toISOString().slice(0, 10) : '';

	// Rejected input is echoed back so a typo never costs the whole form. A
	// checkbox's `values` entry is "on" or ""; `row.cache` is the DB value.
	const cacheInitial = $derived(values.cache !== undefined ? values.cache === 'on' : (row?.cache ?? true));

	let initial = $derived({
		slug: values.slug ?? row?.slug ?? '',
		body: values.body ?? row?.body ?? '',
		note: values.note ?? row?.note ?? '',
		expires: values.expires ?? iso(row?.expires_at)
	});

	let bodyLen = $derived(initial.body.length);
</script>

<form
	method="POST"
	action="?/{mode}"
	class="flex flex-col gap-4"
	use:enhance={saving.submit}
>
	{#if error}
		<p class="rounded-[var(--radius-ui)] bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
	{/if}

	<Field
		id="slug"
		label="Slug"
		error={fields.slug}
		hint={row ? undefined : 'The part after ij5.dev/p/ — this is the link you share.'}
	>
		{#snippet children({ id, describedBy, invalid })}
			<div class="flex items-center gap-2">
				<span class="text-sm text-text-subtle">ij5.dev/p/</span>
				<input
					{id}
					name="slug"
					value={initial.slug}
					readonly={Boolean(row)}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					required
					spellcheck="false"
					autocapitalize="off"
					autocorrect="off"
					placeholder="notes"
					class="{fieldClass(invalid)} {row ? 'text-text-muted' : ''}"
				/>
			</div>
		{/snippet}
	</Field>

	<Field
		id="body"
		label="Text"
		error={fields.body}
		hint="Plaintext, served exactly as written — no formatting, no markup."
	>
		{#snippet children({ id, describedBy, invalid })}
			<div>
				<textarea
					{id}
					name="body"
					rows={14}
					value={initial.body}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					required
					spellcheck="false"
					placeholder="Paste something worth sharing…"
					maxlength={MAX_PASTE_CHARS}
					class="w-full resize-y rounded-[var(--radius-ui)] bg-surface px-3 py-2.5 font-mono text-text shadow-[inset_0_0_0_1px_var(--border-subtle)] transition-shadow duration-150 ease-out placeholder:text-text-subtle focus:shadow-[inset_0_0_0_1px_var(--accent)] focus-visible:outline-none"
				></textarea>
				<p class="tnum mt-1 text-right text-xs text-text-subtle">
					{bodyLen.toLocaleString('en')} / {MAX_PASTE_CHARS.toLocaleString('en')} chars
				</p>
			</div>
		{/snippet}
	</Field>

	<div class="grid gap-4 sm:grid-cols-2">
		<Field id="expires" label="Expires" optional error={fields.expires}>
			{#snippet children({ id, describedBy, invalid })}
				<input
					{id}
					name="expires"
					type="date"
					value={initial.expires}
					aria-describedby={describedBy}
					class={fieldClass(invalid)}
				/>
			{/snippet}
		</Field>

		<!--
			Caching is the default; the checkbox is the opt-out. Checked means
			"cache this paste" (checked by default), unchecked means every view
			re-renders from D1 and edits propagate instantly.
		-->
		<div class="flex flex-col justify-end gap-1.5 pb-0.5">
			<label for="cache" class="flex items-center gap-2.5 text-sm font-medium">
				<input
					id="cache"
					name="cache"
					type="checkbox"
					checked={cacheInitial}
					class="size-4 accent-[var(--accent)]"
				/>
				<span>Cache this paste</span>
			</label>
			<p id="cache-hint" class="pl-6.5 text-xs text-text-subtle">
				Off answers every request no-store, so edits win immediately — at the cost of a
				database read per view.
			</p>
		</div>
	</div>

	<Field id="note" label="Note" optional error={fields.note}>
		{#snippet children({ id, describedBy, invalid })}
			<input
				{id}
				name="note"
				value={initial.note}
				aria-describedby={describedBy}
				placeholder="What this one is for"
				class={fieldClass(invalid)}
			/>
		{/snippet}
	</Field>

	<div class="flex items-center gap-2 pt-1">
		<Button type="submit" variant="primary" busy={saving.busy} busyLabel="Saving…">
			{row ? 'Save changes' : 'Create paste'}
		</Button>

		{#if row}
			<span class="flex-1"></span>
			<Button href="/admin/pastes" variant="ghost">Close</Button>
		{/if}
	</div>
</form>

{#if row}
	<form
		method="POST"
		action="?/delete"
		class="mt-6 border-t border-border-subtle pt-5"
		use:enhance={deleting.submit}
	>
		<input type="hidden" name="slug" value={row.slug} />
		<div class="flex items-center justify-between gap-4">
			<p class="text-xs text-pretty text-text-muted">
				Deleting keeps the analytics history. The paste stops resolving within five
				minutes{cacheInitial ? '' : ' — it was never cached, so it stops immediately'}.
			</p>
			<Button
				type="submit"
				variant="danger"
				size="sm"
				busy={deleting.busy}
				busyLabel="Deleting…"
			>
				Delete
			</Button>
		</div>
	</form>
{/if}
