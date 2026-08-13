<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { startAuthentication } from '@simplewebauthn/browser';
	import Fingerprint from 'lucide-svelte/icons/fingerprint';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	const signingIn = pending();
	let passkeyError = $state('');
	let passkeyBusy = $state(false);

	async function passkeySignIn() {
		passkeyError = '';

		if (!navigator.credentials) {
			passkeyError = 'This browser does not support passkeys.';
			return;
		}

		passkeyBusy = true;
		try {
			const begin = await fetch('/api/passkey/login/begin', { method: 'POST' });
			if (!begin.ok) {
				const body = (await begin.json()) as { error?: string };
				passkeyError = body.error ?? 'Passkey sign-in is unavailable right now.';
				return;
			}
			const { options } = await begin.json();

			const response = await startAuthentication({ optionsJSON: options });

			const done = await fetch('/api/passkey/login/complete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ response })
			});

			if (!done.ok) {
				const body = (await done.json()) as { error?: string };
				passkeyError = body.error ?? 'That passkey did not work.';
				return;
			}

			goto('/admin');
		} catch (e) {
			// A cancelled or declined prompt is the user changing their mind.
			const message = e instanceof Error ? e.message : 'Passkey sign-in was cancelled.';
			if (/not allowed|cancelled|abort/i.test(message)) return;
			passkeyError = message;
		} finally {
			passkeyBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="grid min-h-dvh place-items-center px-4 py-16">
	<div class="w-full max-w-sm">
		<h1 class="text-xl font-semibold">Sign in</h1>
		<p class="mt-1 text-sm text-text-muted">A passkey, or one token, thirty days.</p>

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

		<div class="mt-6 flex items-center gap-3" aria-hidden="true">
			<span class="h-px flex-1 bg-[var(--border-subtle)]"></span>
			<span class="text-xs text-text-subtle">or</span>
			<span class="h-px flex-1 bg-[var(--border-subtle)]"></span>
		</div>

		<Button
			variant="secondary"
			class="mt-6 w-full"
			busy={passkeyBusy}
			busyLabel="Waiting for your device…"
			onclick={passkeySignIn}
		>
			<Fingerprint size={16} aria-hidden="true" />
			Sign in with a passkey
		</Button>

		{#if passkeyError}
			<p role="alert" class="mt-3 text-xs text-danger">{passkeyError}</p>
		{/if}
	</div>
</main>
