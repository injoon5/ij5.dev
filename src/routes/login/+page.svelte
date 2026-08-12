<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const signingIn = pending();
</script>

<svelte:head>
	<title>Sign in</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="grid min-h-dvh place-items-center px-4 py-16">
	<div class="w-full max-w-sm">
		<h1 class="text-xl font-semibold">Sign in</h1>
		<p class="mt-1 text-sm text-text-muted">One token, thirty days.</p>

		<form
			method="POST"
			class="mt-6 flex flex-col gap-4"
			use:enhance={signingIn.submit}
		>
			<Field id="token" label="Token" error={form?.error}>
				{#snippet children({ id, describedBy, invalid })}
					<!-- `type="password"` so password managers autofill it exactly
					     like a password, which is the whole point of using one. -->
					<input
						{id}
						name="token"
						type="password"
						autocomplete="current-password"
						aria-describedby={describedBy}
						aria-invalid={invalid || undefined}
						required
						class={fieldClass(invalid)}
					/>
				{/snippet}
			</Field>

			<Button type="submit" variant="primary" busy={signingIn.busy} busyLabel="Checking…">
				Sign in
			</Button>
		</form>
	</div>
</main>
