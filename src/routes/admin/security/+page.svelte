<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Fingerprint from 'lucide-svelte/icons/fingerprint';
	import KeyRound from 'lucide-svelte/icons/key-round';
	import Hourglass from 'lucide-svelte/icons/hourglass';
	import Trash from 'lucide-svelte/icons/trash-2';
	import Button from '$lib/ui/Button.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { registerPasskey } from '$lib/ui/passkey';
	import { fmtDate } from '$lib/format';
	import { cardFlush, cardTitle, fieldClass, iconButton, notice } from '$lib/ui/styles';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let name = $state('');
	let error = $state('');
	let busy = $state(false);
	let removing = $state<string | null>(null);

	async function addPasskey(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		busy = true;
		try {
			const result = await registerPasskey(name.trim());
			if (!result.ok) {
				if (result.error) error = result.error;
				return;
			}
			// The key is in D1 now; re-running the load cannot drift from it.
			name = '';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	let revoking = $state<string | null>(null);

	/** "3:42 PM" — keys live thirty minutes, so the day never matters. */
	const fmtTime = (ms: number) =>
		new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(ms);

	const confirmRevoke =
		(key: { id: string }): SubmitFunction =>
		(input) => {
			if (!confirm('Revoke this install key? An agent still holding it will get a 401.')) {
				input.cancel();
				return;
			}
			revoking = key.id;
			return async ({ update }) => {
				await update();
				revoking = null;
			};
		};

	const confirmDelete =
		(key: { id: string; name: string }): SubmitFunction =>
		(input) => {
			const last = data.passkeys.length === 1;
			const message = last
				? `Remove “${key.name}”? It is your last passkey; you will sign in with the token.`
				: `Remove “${key.name}”? It will no longer sign you in.`;
			if (!confirm(message)) {
				input.cancel();
				return;
			}
			removing = key.id;
			return async ({ update }) => {
				await update();
				removing = null;
			};
		};
</script>

<svelte:head><title>Security</title></svelte:head>

<PageHeader title="Security" />

<div class="flex max-w-2xl flex-col gap-4 px-4 pt-5 pb-10 md:px-6 md:pt-8">
	<h2 class={cardTitle}>Passkeys</h2>

	{#if form?.error}
		<p role="alert" class={notice.error}>{form.error}</p>
	{/if}

	<div class="{cardFlush}">
		{#if data.passkeys.length}
			<ul class="divide-y divide-border-subtle">
				{#each data.passkeys as key (key.id)}
					<li
						class="flex items-center gap-3 py-3 ps-4 pe-2 transition-opacity duration-150 ease-out md:ps-5 {removing ===
						key.id
							? 'opacity-50'
							: ''}"
					>
						<span
							class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-muted"
							aria-hidden="true"
						>
							<KeyRound size={16} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[0.9375rem] font-medium md:text-sm">{key.name}</p>
							<p class="mt-0.5 text-xs text-text-muted">
								Added {fmtDate(key.created_at)}{key.last_used_at
									? ` · Last used ${fmtDate(key.last_used_at)}`
									: ''}
							</p>
						</div>

						<form method="POST" action="?/delete" use:enhance={confirmDelete(key)}>
							<input type="hidden" name="id" value={key.id} />
							<button
								type="submit"
								class="{iconButton} hover:text-danger"
								aria-label="Remove {key.name}"
								title="Remove"
								disabled={removing === key.id}
							>
								<Trash size={15} aria-hidden="true" />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-4 py-5 text-sm text-text-muted md:px-5">
				No passkeys yet. Add one to sign in without the token.
			</p>
		{/if}

		<!-- Adding is the last row of the list it adds to. -->
		<form
			class="flex flex-col gap-2 border-t border-border-subtle p-4 sm:flex-row md:p-5"
			onsubmit={addPasskey}
		>
			<label for="passkey-name" class="sr-only">Passkey name</label>
			<input
				id="passkey-name"
				bind:value={name}
				name="name"
				placeholder="Name this device, e.g. MacBook"
				required
				maxlength="60"
				autocomplete="off"
				aria-describedby={error ? 'passkey-error' : undefined}
				aria-invalid={Boolean(error) || undefined}
				class="{fieldClass(Boolean(error))} sm:flex-1"
			/>
			<Button type="submit" variant="primary" size="form" {busy} busyLabel="Waiting for device…">
				<Fingerprint size={15} aria-hidden="true" />
				Add passkey
			</Button>
		</form>
		{#if error}
			<p id="passkey-error" role="alert" class="-mt-2 px-4 pb-4 text-xs text-danger md:px-5">{error}</p>
		{/if}
	</div>

	<h2 class="{cardTitle} mt-6">Install keys</h2>
	<p class="-mt-2 text-sm text-pretty text-text-muted">
		One-time keys Shelf puts in the prompts it copies. Each installs or updates one app, once, within 30 minutes.
	</p>

	<div class={cardFlush}>
		{#if data.installKeys.length}
			<ul class="divide-y divide-border-subtle">
				{#each data.installKeys as key (key.id)}
					<li
						class="flex items-center gap-3 py-3 ps-4 pe-2 transition-opacity duration-150 ease-out md:ps-5 {revoking ===
						key.id
							? 'opacity-50'
							: ''}"
					>
						<span
							class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-muted"
							aria-hidden="true"
						>
							<Hourglass size={16} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[0.9375rem] font-medium md:text-sm">
								{key.slug ? `Update ${key.slug}` : 'Create one new app'}
							</p>
							<p class="mt-0.5 text-xs text-text-muted">
								<span class="font-mono">{key.id}</span> · Expires {fmtTime(key.expires_at)}{key.attempts
									? ` · ${key.attempts} failed ${key.attempts === 1 ? 'try' : 'tries'}`
									: ''}
							</p>
						</div>

						<form method="POST" action="?/revokeKey" use:enhance={confirmRevoke(key)}>
							<input type="hidden" name="id" value={key.id} />
							<button
								type="submit"
								class="{iconButton} hover:text-danger"
								aria-label="Revoke key {key.id}"
								title="Revoke"
								disabled={revoking === key.id}
							>
								<Trash size={15} aria-hidden="true" />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-4 py-5 text-sm text-text-muted md:px-5">No live install keys.</p>
		{/if}
	</div>
</div>
