<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fieldClass, notice } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { fmtBytes } from '$lib/format';
	import { parseReply, slugify } from '$lib/replyParser';
	import { MAX_APP_BYTES, MAX_APP_NAME, TINTS, type AppFull } from '$lib/types';
	import AppTile from './AppTile.svelte';
	import { TINT_HEX } from './tints';

	type Props = {
		/** `null` puts the form in New App mode. */
		app: AppFull | null;
		/** Keys the app has stored, for the delete dialog's wording. */
		dataKeys?: number;
		fields?: Record<string, string>;
		values?: Record<string, string>;
		error?: string;
		/** After a create, with the new slug; after a delete, with nothing. */
		onDone?: (slug?: string) => void;
	};

	let { app, dataKeys = 0, fields = {}, values = {}, error, onDone }: Props = $props();

	let mode = $derived(app ? 'update' : 'create');

	// Every field is bound: New App fills them all from a pasted reply, and
	// the tile and the byte counter follow typing. They re-seed when the
	// echoed-back values or the app change, and `untrack` keeps that reseed
	// from firing on every keystroke.
	const seed = () => ({
		slug: values.slug ?? app?.slug ?? '',
		name: values.name ?? app?.name ?? '',
		icon: values.icon ?? app?.icon ?? '',
		tint: values.tint ?? app?.tint ?? 'blue',
		source: values.source ?? app?.source ?? ''
	});
	// svelte-ignore state_referenced_locally
	let form = $state(seed());
	$effect(() => {
		const next = seed();
		untrack(() => {
			form = next;
		});
	});

	// The slug follows the name until someone types in it — after that it is
	// theirs.
	let slugTouched = $state(false);

	let reply = $state('');
	let parsedFrom = $state(false);

	/** New App: a pasted reply fills every field, using the same rules as the phone. */
	function fill(text: string) {
		if (!text.trim()) return;
		const parsed = parseReply(text);
		form = {
			slug: slugTouched ? form.slug : parsed.slug,
			name: parsed.name ?? form.name,
			icon: parsed.icon ?? '',
			tint: parsed.tint,
			source: parsed.source
		};
		parsedFrom = true;
	}

	const encoder = new TextEncoder();
	let bytes = $derived(encoder.encode(form.source.replace(/\r\n?/g, '\n')).length);
	let over = $derived(bytes > MAX_APP_BYTES);

	let saved = $state(false);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	const saving = pending({
		onSuccess: (data) => {
			if (mode === 'create') return onDone?.(String(data?.saved ?? ''));
			saved = true;
			clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (saved = false), 1600);
		}
	});

	const reverting = pending();
	const confirmRevert: SubmitFunction = (input) => {
		if (!confirm(`Go back to the previous version of ${app?.name}? The current one is kept, so reverting again undoes this.`)) {
			input.cancel();
			return;
		}
		return reverting.submit(input);
	};

	let dialog = $state<HTMLDialogElement | null>(null);
	const deleting = pending({ onSuccess: () => onDone?.() });
	const submitDelete: SubmitFunction = (input) => {
		dialog?.close();
		return deleting.submit(input);
	};

	const swatch =
		'grid size-8 cursor-pointer place-items-center rounded-full transition-[scale,box-shadow] duration-150 ease-out active:scale-[0.92] has-[:checked]:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--text)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-accent pointer-fine:size-7';
</script>

{#if !app}
	<!-- New App: paste the model's reply and the form below fills itself. -->
	<div class="mb-5 flex flex-col gap-1.5 border-b border-border-subtle pb-5">
		<label for="reply" class="text-sm font-medium">Reply</label>
		<textarea
			id="reply"
			rows={5}
			bind:value={reply}
			oninput={(e) => fill(e.currentTarget.value)}
			spellcheck="false"
			placeholder="Paste the model's reply, or a Swift file"
			class="{fieldClass(false)} resize-y font-mono text-[13px] leading-[1.6] pointer-fine:text-[12.5px]"
		></textarea>
		<p class="text-xs text-text-muted" role="status">
			{#if parsedFrom && !form.name}
				No <code class="font-mono">// Name:</code> line found. Name the app below.
			{:else if parsedFrom}
				Filled in from the reply. Check the fields, then create.
			{:else}
				The name, icon, tint and source are read from it.
			{/if}
		</p>
	</div>
{/if}

<form method="POST" action="?/save" class="flex flex-col gap-4 md:gap-5" use:enhance={saving.submit}>
	<input type="hidden" name="mode" value={mode} />

	{#if error}
		<p role="alert" class={notice.error}>{error}</p>
	{/if}

	<div class="flex items-end gap-3">
		<AppTile name={form.name} tint={form.tint} size={44} />
		<div class="min-w-0 flex-1">
			<Field id="name" label="Name" error={fields.name}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{id}
						name="name"
						bind:value={form.name}
						oninput={(e) => {
							if (!app && !slugTouched) form.slug = slugify(e.currentTarget.value);
						}}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						required
						maxlength={MAX_APP_NAME}
						autocomplete="off"
						placeholder="Habits"
						class={fieldClass(invalid)}
					/>
				{/snippet}
			</Field>
		</div>
	</div>

	{#if app}
		<input type="hidden" name="slug" value={app.slug} />
	{:else}
		<Field id="slug" label="Slug" error={fields.slug}>
			{#snippet children({ id, describedBy, invalid })}
				<input
					{id}
					name="slug"
					bind:value={form.slug}
					oninput={() => (slugTouched = true)}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					required
					spellcheck="false"
					autocapitalize="off"
					autocorrect="off"
					autocomplete="off"
					placeholder="habits"
					class="{fieldClass(invalid)} font-mono"
				/>
			{/snippet}
		</Field>
	{/if}

	<Field
		id="icon"
		label="Icon"
		error={fields.icon}
		hint="An SF Symbol name. The phone falls back to “app” for a name it does not know."
	>
		{#snippet children({ id, describedBy, invalid })}
			<input
				{id}
				name="icon"
				bind:value={form.icon}
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				spellcheck="false"
				autocapitalize="off"
				autocorrect="off"
				autocomplete="off"
				placeholder="checkmark.circle.fill"
				class="{fieldClass(invalid)} font-mono"
			/>
		{/snippet}
	</Field>

	<fieldset class="flex min-w-0 flex-col gap-1.5">
		<legend class="mb-1.5 text-sm font-medium">Tint</legend>
		<div class="flex flex-wrap gap-2">
			{#each TINTS as tint (tint)}
				<label class={swatch} style:background-color={TINT_HEX[tint]} title={tint}>
					<input type="radio" name="tint" value={tint} bind:group={form.tint} class="sr-only" />
					<span class="sr-only">{tint}</span>
				</label>
			{/each}
		</div>
		{#if fields.tint}
			<p class="text-xs text-danger">{fields.tint}</p>
		{/if}
	</fieldset>

	<Field
		id="source"
		label="Source"
		error={fields.source}
		hint="{fmtBytes(bytes)} of {fmtBytes(MAX_APP_BYTES)}"
	>
		{#snippet children({ id, describedBy, invalid })}
			<textarea
				{id}
				name="source"
				rows={18}
				bind:value={form.source}
				aria-describedby={describedBy}
				aria-invalid={invalid || over || undefined}
				required
				spellcheck="false"
				autocapitalize="off"
				wrap="off"
				class="{fieldClass(invalid || over)} resize-y font-mono text-[12.5px] leading-[1.55] max-md:h-72 pointer-fine:text-[12px]"
			></textarea>
		{/snippet}
	</Field>

	<div class="flex flex-col-reverse gap-2 pt-2 md:flex-row md:items-center md:border-t md:border-border-subtle md:pt-4">
		{#if app}
			<Button
				type="button"
				variant="danger"
				size="form"
				class="md:-ms-3"
				busy={deleting.busy}
				busyLabel="Deleting…"
				onclick={() => dialog?.showModal()}
			>
				Delete
			</Button>
			{#if app.revertible}
				<Button
					type="submit"
					form="revert-app"
					variant="ghost"
					size="form"
					busy={reverting.busy}
					busyLabel="Reverting…"
				>
					Revert
				</Button>
			{/if}
		{/if}
		<span class="hidden flex-1 md:block"></span>
		<Button type="submit" variant="primary" size="form" disabled={over} busy={saving.busy} busyLabel="Saving…">
			{app ? (saved ? 'Saved' : 'Save') : 'Create app'}
		</Button>
	</div>
</form>

{#if app}
	<form id="revert-app" method="POST" action="?/revert" use:enhance={confirmRevert} hidden>
		<input type="hidden" name="slug" value={app.slug} />
	</form>

	<!-- Deleting asks one question: whether the data goes too. Keeping it is
	     the default, so an app can be deleted and made again without losing
	     what it saved. -->
	<dialog
		bind:this={dialog}
		aria-labelledby="delete-app-title"
		class="m-auto w-[min(24rem,calc(100vw-2rem))] scale-95 rounded-[var(--radius-ui-lg)] border-0 bg-surface p-5 text-text opacity-0 shadow-[var(--shadow-pop)] transition-[opacity,scale,display,overlay] duration-150 ease-out transition-discrete open:scale-100 open:opacity-100 backdrop:bg-[oklch(0_0_0/0.2)] starting:open:scale-95 starting:open:opacity-0"
	>
		<form method="POST" action="?/delete" use:enhance={submitDelete} class="flex flex-col gap-4">
			<input type="hidden" name="slug" value={app.slug} />
			<h2 id="delete-app-title" class="text-[0.9375rem] font-semibold">Delete {app.name}?</h2>
			<p class="text-sm text-pretty text-text-muted">
				It disappears from the phone on its next sync, with its history.
			</p>
			<label class="flex cursor-pointer items-start gap-2.5 text-sm select-none">
				<input type="checkbox" name="data" value="delete" class="mt-0.5 size-4 accent-[var(--danger)]" />
				<span>
					Also delete its data
					<span class="block text-xs text-text-muted">
						{dataKeys === 1 ? '1 key' : `${dataKeys.toLocaleString('en')} keys`}. Kept unless this is ticked.
					</span>
				</span>
			</label>
			<div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
				<Button type="button" variant="secondary" size="form" onclick={() => dialog?.close()}>Cancel</Button>
				<Button type="submit" variant="danger" size="form">Delete app</Button>
			</div>
		</form>
	</dialog>
{/if}
