<script lang="ts">
	import { enhance } from '$app/forms';
	import { startRegistration } from '@simplewebauthn/browser';
	import Fingerprint from 'lucide-svelte/icons/fingerprint';
	import Trash from 'lucide-svelte/icons/trash-2';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { card, fieldClass } from '$lib/ui/styles';
	import { pending } from '$lib/ui/pending.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let name = $state('');
	let error = $state('');
	const adding = pending({ reset: () => true, onSuccess: () => (name = '') });

	async function addPasskey() {
		error = '';
		if (!navigator.credentials) {
			error = 'This browser does not support passkeys.';
			return;
		}

		try {
			const begin = await fetch('/api/passkey/register/begin', { method: 'POST' });
			const { options } = await begin.json();

			const response = await startRegistration({ optionsJSON: options });

			const done = await fetch('/api/passkey/register/complete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ response, name })
			});

			if (!done.ok) {
				const body = (await done.json()) as { error?: string };
				error = body.error ?? 'That passkey could not be saved.';
				return;
			}

			// The saved key is now in D1; a reload shows it. A round trip that
			// re-renders is simpler than hand-appending the row, and it cannot
			// drift from what is actually stored.
			location.reload();
		} catch (e) {
			// `startRegistration` throws a WebAuthnError for cancelled prompts
			// and NotAllowedError for a declined one. Both are the user changing
			// their mind, not a failure worth shouting about.
			const message = e instanceof Error ? e.message : 'Passkey registration was cancelled.';
			if (/not allowed|cancelled|abort/i.test(message)) return;
			error = message;
		}
	}

	const fmtDate = (ms: number) =>
		new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
</script>

<svelte:head><title>Security</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold">Security</h1>
	<p class="mt-1 max-w-[68ch] text-sm text-pretty text-text-muted">
		Sign in with a passkey instead of typing the token. The private key stays on your device —
		nothing here can be phished, and there is nothing to remember.
	</p>
</header>

{#if form?.error}
	<p role="alert" class="mb-4 rounded-[var(--radius-ui)] bg-danger-tint px-3 py-2 text-sm text-danger">
		{form.error}
	</p>
{/if}

<section class="mb-4 {card}">
	<h2 class="text-sm font-semibold">Add a passkey</h2>
	<p class="mt-1 max-w-[68ch] text-sm text-pretty text-text-muted">
		This device will ask for your fingerprint, face, PIN or security key. Name it so you can tell
		it apart from other devices later.
	</p>

	<form
		class="mt-3 flex flex-col gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			addPasskey();
		}}
	>
		<Field id="passkey-name" label="Name">
			{#snippet children({ id, describedBy })}
				<input
					{id}
					bind:value={name}
					name="name"
					placeholder="MacBook Touch ID"
					aria-describedby={describedBy}
					required
					maxlength="60"
					class={fieldClass(false)}
				/>
			{/snippet}
		</Field>

		{#if error}
			<p role="alert" class="text-xs text-danger">{error}</p>
		{/if}

		<div>
			<Button type="submit" variant="primary" busy={adding.busy} busyLabel="Waiting for your device…">
				<Fingerprint size={15} aria-hidden="true" />
				Add passkey
			</Button>
		</div>
	</form>
</section>

<section class={card}>
	<h2 class="text-sm font-semibold">Saved passkeys</h2>

	{#if !data.passkeys.length}
		<p class="mt-2 text-sm text-text-muted">
			No passkeys yet. The token still works — add one above and it takes over from there.
		</p>
	{:else}
		<ul class="mt-3 flex flex-col">
			{#each data.passkeys as key (key.id)}
				<li
					class="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-3 last:border-b-0"
				>
					<div class="min-w-0">
						<p class="truncate text-sm font-medium">{key.name}</p>
						<p class="mt-0.5 text-xs text-text-muted">
							Added {fmtDate(key.created_at)}
							{#if key.last_used_at}
								· last used {fmtDate(key.last_used_at)}
							{/if}
						</p>
					</div>

					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={key.id} />
						<Button type="submit" variant="ghost" size="sm" aria-label={`Delete ${key.name}`}>
							<Trash size={15} aria-hidden="true" />
						</Button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>
