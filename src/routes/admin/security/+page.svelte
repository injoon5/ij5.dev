<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Fingerprint from 'lucide-svelte/icons/fingerprint';
	import KeyRound from 'lucide-svelte/icons/key-round';
	import Hourglass from 'lucide-svelte/icons/hourglass';
	import Trash from 'lucide-svelte/icons/trash-2';
	import Monitor from 'lucide-svelte/icons/monitor';
	import LogOut from 'lucide-svelte/icons/log-out';
	import Button from '$lib/ui/Button.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { registerPasskey } from '$lib/auth/passkey';
	import { fmtDate, fmtTime, fmtWhen } from '$lib/format';
	import { badge, card, cardFlush, cardTitle, fieldClass, iconButton, notice } from '$lib/ui/styles';
	import { pending, pendingRows } from '$lib/ui/pending.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let name = $state('');
	let error = $state('');
	let busy = $state(false);

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



	const revoking = pendingRows({ confirm: () => 'Revoke this install key? An agent still holding it will get a 401.' });

	const removing = pendingRows({
		confirm: (id) => {
			const name = data.passkeys.find((p) => p.id === id)?.name;
			return data.passkeys.length === 1
				? `Remove “${name}”? It is your last passkey; you will need the token or a recovery code.`
				: `Remove “${name}”? It will no longer sign you in.`;
		}
	});

	const METHOD: Record<string, string> = {
		passkey: 'Passkey',
		token: 'Token',
		password: 'Password + puzzle',
		recovery: 'Recovery code'
	};

	const EVENT: Record<string, string> = {
		'sign-in': 'Signed in',
		failed: 'Failed attempt',
		locked: 'Locked after failures',
		'sign-out-all': 'Signed out everywhere else'
	};

	const ending = pendingRows({
		confirm: (id) => (id === data.sessions.find((x) => x.current)?.id ? 'End this session? You will be signed out here.' : null)
	});

	const signingOutOthers = pending();
	const printing = pending({
		confirm: () => (data.recovery.total ? 'Make a new sheet? Every code on the old one stops working.' : null)
	});
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
						class="flex items-center gap-3 py-3 ps-4 pe-2 transition-opacity duration-150 ease-out md:ps-5 {removing.busy(key.id)
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

						<form method="POST" action="?/delete" use:enhance={removing.submit(key.id)}>
							<input type="hidden" name="id" value={key.id} />
							<button
								type="submit"
								class="{iconButton} hover:text-danger"
								aria-label="Remove {key.name}"
								title="Remove"
								disabled={removing.busy(key.id)}
							>
								<Trash size={15} aria-hidden="true" />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-4 py-5 text-sm text-text-muted md:px-5">
				No passkeys yet. Add one to sign in without typing anything.
			</p>
		{/if}

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

	<h2 class="{cardTitle} mt-6">Sessions</h2>
	<div class={cardFlush}>
		<ul class="divide-y divide-border-subtle">
			{#each data.sessions as s (s.id)}
				<li
					class="flex items-center gap-3 py-3 ps-4 pe-2 transition-opacity duration-150 ease-out md:ps-5 {ending.busy(s.id)
						? 'opacity-50'
						: ''}"
				>
					<span
						class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-muted"
						aria-hidden="true"
					>
						<Monitor size={16} />
					</span>
					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-2 truncate text-[0.9375rem] font-medium md:text-sm">
							{s.where || 'Unknown device'}
							{#if s.current}<span class={badge}>This one</span>{/if}
							{#if s.strength === 'limited'}<span class={badge}>Limited</span>{/if}
						</p>
						<p class="mt-0.5 truncate text-xs text-text-muted">
							{METHOD[s.method] ?? s.method} · Signed in {fmtWhen(s.created_at)} · Ends {fmtWhen(s.expires_at)}
						</p>
					</div>
					<form method="POST" action="?/revokeSession" use:enhance={ending.submit(s.id)}>
						<input type="hidden" name="id" value={s.id} />
						<button
							type="submit"
							class="{iconButton} hover:text-danger"
							aria-label={s.current ? 'End this session' : `End session on ${s.where}`}
							title="End session"
							disabled={ending.busy(s.id)}
						>
							<LogOut size={15} aria-hidden="true" />
						</button>
					</form>
				</li>
			{/each}
		</ul>
		{#if data.sessions.length > 1}
			<form
				method="POST"
				action="?/signOutOthers"
				class="border-t border-border-subtle p-4 md:p-5"
				use:enhance={signingOutOthers.submit}
			>
				<Button type="submit" variant="secondary" size="form" busy={signingOutOthers.busy} busyLabel="Signing out…">
					Sign out everywhere else
				</Button>
			</form>
		{/if}
	</div>

	<h2 class="{cardTitle} mt-6">No device with you</h2>
	<p class="-mt-2 text-sm text-pretty text-text-muted">
		{#if data.password}
			The password with the puzzle gives a limited hour; with a recovery code it gives a full session and burns
			the code.
		{:else}
			The password and puzzle are not set up. Run <code class="font-mono text-xs">node scripts/auth.mjs password</code>
			and set the secrets it prints.
		{/if}
	</p>
	<div class={card}>
		{#if form && 'codes' in form && form.codes}
			<p class="text-sm font-medium">Your new recovery codes</p>
			<p class="mt-1 text-xs text-text-muted">
				Print or write these down now. They are not shown again, and each works once.
			</p>
			<ol class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-sm tabular-nums">
				{#each form.codes as code (code)}
					<li>{code}</li>
				{/each}
			</ol>
		{:else}
			<p class="text-sm">
				{#if data.recovery.total}
					<span class="font-medium">{data.recovery.left} of {data.recovery.total}</span> recovery codes left{data
						.recovery.created_at
						? `, printed ${fmtDate(data.recovery.created_at)}`
						: ''}.
				{:else}
					No recovery codes yet.
				{/if}
			</p>
		{/if}
		<form method="POST" action="?/recoveryCodes" class="mt-4" use:enhance={printing.submit}>
			<Button type="submit" variant="secondary" size="form" busy={printing.busy} busyLabel="Making codes…">
				{data.recovery.total ? 'Make a new sheet' : 'Make recovery codes'}
			</Button>
		</form>
	</div>

	{#if data.oidc}
		<p class="text-xs text-pretty text-text-muted">
			Cloudflare Access can sign in here over OpenID Connect:
			<span class="font-mono break-all">{data.oidc.discovery}</span>
		</p>
	{/if}

	<h2 class="{cardTitle} mt-6">Recent sign-in activity</h2>
	<div class={cardFlush}>
		{#if data.events.length}
			<ul class="divide-y divide-border-subtle">
				{#each data.events as e (e.id)}
					<li class="flex items-baseline justify-between gap-3 px-4 py-2.5 md:px-5">
						<div class="min-w-0">
							<p class="text-sm {e.kind === 'sign-in' ? '' : 'text-danger'}">
								{EVENT[e.kind] ?? e.kind}{e.method ? ` · ${METHOD[e.method] ?? e.method}` : ''}
							</p>
							<p class="mt-0.5 truncate text-xs text-text-muted">{e.where}</p>
						</div>
						<span class="shrink-0 text-xs text-text-subtle tabular-nums">{fmtWhen(e.at)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-4 py-5 text-sm text-text-muted md:px-5">Nothing yet.</p>
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
						class="flex items-center gap-3 py-3 ps-4 pe-2 transition-opacity duration-150 ease-out md:ps-5 {revoking.busy(key.id)
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

						<form method="POST" action="?/revokeKey" use:enhance={revoking.submit(key.id)}>
							<input type="hidden" name="id" value={key.id} />
							<button
								type="submit"
								class="{iconButton} hover:text-danger"
								aria-label="Revoke key {key.id}"
								title="Revoke"
								disabled={revoking.busy(key.id)}
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
