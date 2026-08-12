<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import type { SlugRow } from '$lib/types';

	type Props = {
		/** `null` puts the form in create mode. */
		row: SlugRow | null;
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

	// Rejected input is echoed back so a typo never costs the whole form.
	let initial = $derived({
		slug: values.slug ?? row?.slug ?? '',
		target_url: values.target_url ?? row?.target_url ?? '',
		status: values.status ?? String(row?.status ?? 302),
		note: values.note ?? row?.note ?? '',
		expires: values.expires ?? iso(row?.expires_at)
	});
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
		hint={row ? undefined : 'The part after ij5.dev/ — this is the link you share.'}
	>
		{#snippet children({ id, describedBy, invalid })}
			<div class="flex items-center gap-2">
				<span class="text-sm text-text-subtle">ij5.dev/</span>
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
					placeholder="gh"
					class="{fieldClass(invalid)} {row ? 'text-text-muted' : ''}"
				/>
			</div>
		{/snippet}
	</Field>

	<Field id="target_url" label="Destination" error={fields.target_url}>
		{#snippet children({ id, describedBy, invalid })}
			<input
				{id}
				name="target_url"
				type="url"
				value={initial.target_url}
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				required
				spellcheck="false"
				placeholder="https://"
				class={fieldClass(invalid)}
			/>
		{/snippet}
	</Field>

	<div class="grid gap-4 sm:grid-cols-2">
		<Field
			id="status"
			label="Redirect"
			error={fields.status}
			hint="301 is cached by the browser forever. Only for links you will never repoint."
		>
			{#snippet children({ id, describedBy, invalid })}
				<select {id} name="status" aria-describedby={describedBy} class={fieldClass(invalid)}>
					<option value="302" selected={initial.status === '302'}>302 — temporary</option>
					<option value="301" selected={initial.status === '301'}>301 — permanent</option>
				</select>
			{/snippet}
		</Field>

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
	</div>

	<Field id="note" label="Note" optional error={fields.note}>
		{#snippet children({ id, describedBy, invalid })}
			<input
				{id}
				name="note"
				value={initial.note}
				aria-describedby={describedBy}
				placeholder="Where this one gets shared"
				class={fieldClass(invalid)}
			/>
		{/snippet}
	</Field>

	<div class="flex items-center gap-2 pt-1">
		<Button type="submit" variant="primary" busy={saving.busy} busyLabel="Saving…">
			{row ? 'Save changes' : 'Create link'}
		</Button>

		{#if row}
			<span class="flex-1"></span>
			<Button href="/admin" variant="ghost">Close</Button>
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
				Deleting keeps the analytics history. The link stops resolving within five minutes.
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
