<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import AssetInput from '$lib/ui/AssetInput.svelte';
	import { cardTitle, fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { serializeLines } from '$lib/lines';
	import type { Profile } from '$lib/types';

	/**
	 * The masthead: name, tagline, avatar, and the links the share card and
	 * search engines see. `dirty` is bound out so the page can say there are
	 * unsaved changes and Publish can save them first; `formEl` lets it do so.
	 */
	let {
		draft,
		assetsOrigin,
		fields = {},
		dirty = $bindable(false),
		formEl = $bindable(null)
	}: {
		draft: Profile;
		assetsOrigin: string;
		fields?: Record<string, string>;
		dirty?: boolean;
		formEl?: HTMLFormElement | null;
	} = $props();

	const saving = pending({ onSuccess: () => (dirty = false) });

	let linksValue = $derived(serializeLines(draft.links, ['label', 'href', 'icon']));
</script>

<section class="min-w-0">
	<h2 class="{cardTitle} mb-3">Profile</h2>

	<form
		bind:this={formEl}
		method="POST"
		action="?/profile"
		class="flex flex-col gap-4 md:gap-5 md:rounded-[var(--radius-ui-lg)] md:border md:border-border-subtle md:bg-surface md:p-5"
		oninput={() => (dirty = true)}
		use:enhance={saving.submit}
	>
		<!-- The masthead as it reads on the page: picture, name, line. -->
		<div class="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] md:gap-5">
			<Field id="p-avatar" label="Avatar" error={fields.avatar}>
				{#snippet children({ id, describedBy, invalid })}
					<AssetInput
						{id}
						name="avatar"
						value={draft.avatar ?? ''}
						{assetsOrigin}
						{describedBy}
						{invalid}
						onchange={() => (dirty = true)}
					/>
				{/snippet}
			</Field>
			<Field id="p-name" label="Name" error={fields.name}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{id}
						name="name"
						value={draft.name}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						required
						maxlength="80"
						autocomplete="off"
						class={fieldClass(invalid)}
					/>
				{/snippet}
			</Field>

			<Field id="p-tagline" label="Tagline" error={fields.tagline}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{id}
						name="tagline"
						value={draft.tagline ?? ''}
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						maxlength="160"
						autocomplete="off"
						class={fieldClass(invalid)}
					/>
				{/snippet}
			</Field>
		</div>

		<!-- The format is the one thing here nobody could guess, so the hint
		     stays: it says what these are for and how to write one. -->
		<Field
			id="p-links"
			label="Profile links"
			hint="For the share card and search engines. One per line: label | URL"
		>
			{#snippet children({ id, describedBy, invalid })}
				<textarea
					{id}
					name="links"
					rows="3"
					value={linksValue}
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					spellcheck="false"
					placeholder="GitHub | https://github.com/you"
					class="{fieldClass(invalid)} resize-y font-mono text-[13px] pointer-fine:text-[12.5px]"
				></textarea>
			{/snippet}
		</Field>

		<div class="flex md:justify-end">
			<Button
				type="submit"
				variant="secondary"
				size="form"
				disabled={!dirty}
				busy={saving.busy}
				busyLabel="Saving…"
			>
				Save profile
			</Button>
		</div>
	</form>
</section>
