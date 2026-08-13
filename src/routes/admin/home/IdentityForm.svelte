<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import AssetInput from '$lib/ui/AssetInput.svelte';
	import { card, fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import { serializeLines } from '$lib/lines';
	import type { Profile } from '$lib/types';
	import type { ActionData } from './$types';

	let { draft, assetsOrigin, form }: { draft: Profile; assetsOrigin: string; form: ActionData } =
		$props();

	const saving = pending();

	let linksValue = $derived(serializeLines(draft.links, ['label', 'href', 'icon']));
</script>

<section class="{card}">
	<h2 class="text-sm font-semibold">Identity</h2>

	<form
		method="POST"
		action="?/profile"
		class="mt-3 flex flex-col gap-4"
		use:enhance={saving.submit}
	>
		<Field id="p-name" label="Name" error={form?.intent === 'profile' ? form.fields?.name : undefined}>
			{#snippet children({ id, describedBy, invalid })}
				<input {id} name="name" value={draft.name} aria-describedby={describedBy} aria-invalid={invalid || undefined} required class={fieldClass(invalid)} />
			{/snippet}
		</Field>

		<Field id="p-tagline" label="Tagline" optional hint="One line under your name.">
			{#snippet children({ id, describedBy, invalid })}
				<input {id} name="tagline" value={draft.tagline ?? ''} aria-describedby={describedBy} aria-invalid={invalid || undefined} class={fieldClass(invalid)} />
			{/snippet}
		</Field>

		<Field id="p-avatar" label="Avatar" optional>
			{#snippet children({ id, describedBy })}
				<AssetInput {id} name="avatar" value={draft.avatar ?? ''} {assetsOrigin} {describedBy} />
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
					class="{fieldClass(invalid)} resize-y font-mono"
				></textarea>
			{/snippet}
		</Field>

		<div>
			<Button type="submit" variant="secondary" size="sm" busy={saving.busy} busyLabel="Saving…">
				Save identity
			</Button>
		</div>
	</form>
</section>
