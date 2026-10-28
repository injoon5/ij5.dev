<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import Fingerprint from 'lucide-svelte/icons/fingerprint';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { signInWithPasskey } from '$lib/ui/passkey';
	import { fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const signingIn = pending();
	let passkeyError = $state('');
	let passkeyBusy = $state(false);

	// A passkey is the better way in — nothing to paste, nothing to phish — so
	// it leads; the token is the fallback beneath it.
	async function passkeySignIn() {
		passkeyError = '';
		passkeyBusy = true;
		try {
			const result = await signInWithPasskey();
			if (!result.ok) {
				if (result.error) passkeyError = result.error;
				return;
			}
			await goto('/admin', { invalidateAll: true });
		} finally {
			passkeyBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	class="grid min-h-dvh place-items-center px-5 pt-[max(4rem,env(safe-area-inset-top))] pb-[max(4rem,env(safe-area-inset-bottom))]"
>
	<div class="w-full max-w-[22rem]">
		<a href="/" class="mx-auto mb-6 block size-11 transition-[scale] duration-150 ease-out active:scale-[0.96]">
			<img src="/icon.svg" alt="ij5.dev" width="44" height="44" class="size-11 rounded-[12px]" />
		</a>
		<h1 class="text-center text-xl font-semibold tracking-[-0.018em]">Sign in</h1>

		<div class="mt-8 flex flex-col gap-3">
			<Button
				variant="primary"
				size="lg"
				busy={passkeyBusy}
				busyLabel="Waiting for your device…"
				onclick={passkeySignIn}
			>
				<Fingerprint size={16} aria-hidden="true" />
				Sign in with a passkey
			</Button>

			{#if passkeyError}
				<p role="alert" class="text-center text-xs text-danger">{passkeyError}</p>
			{/if}
		</div>

		<div class="my-6 flex items-center gap-3" aria-hidden="true">
			<span class="h-px flex-1 bg-border-subtle"></span>
			<span class="text-xs text-text-subtle">or</span>
			<span class="h-px flex-1 bg-border-subtle"></span>
		</div>

		<form method="POST" class="flex flex-col gap-3" use:enhance={signingIn.submit}>
			<Field id="token" label="Token" error={form?.error}>
				{#snippet children({ id, describedBy, invalid })}
					<!-- `type="password"` so a password manager fills it like one,
					     which is the whole point of keeping it in one. -->
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

			<Button
				type="submit"
				variant="secondary"
				size="lg"
				busy={signingIn.busy}
				busyLabel="Checking…"
			>
				Sign in with token
			</Button>
		</form>
	</div>
</main>
