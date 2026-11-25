<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Fingerprint from 'lucide-svelte/icons/fingerprint';
	import Button from '$lib/ui/Button.svelte';
	import Field from '$lib/ui/Field.svelte';
	import { signInWithPasskey } from '$lib/auth/passkey';
	import { fieldClass } from '$lib/ui/styles';
	import { turnstile } from '$lib/auth/turnstileWidget';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Door = 'password' | 'recovery' | 'token';
	// No password configured → the token is the only typed door left.
	let chosen = $state<Door | null>(null);
	let door = $derived<Door>(chosen ?? (data.password ? 'password' : 'token'));

	let passkeyError = $state('');
	let passkeyBusy = $state(false);
	let busy = $state(false);
	let attempt = $state(0);

	const action = (name: Door) => `?/${name}&next=${encodeURIComponent(data.next)}`;
	const errorFor = (d: Door) => (form?.door === d ? form.error : undefined);
	const COLS = ['A', 'B', 'C', 'D'];

	/** "3:42 PM" — when a locked door opens again. */
	const fmtTime = (ms: number) =>
		new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(ms);

	/**
	 * The OIDC flow continues at `/oauth/authorize`, which answers with a
	 * redirect to Cloudflare Access. That has to be a real navigation — the
	 * client router cannot follow a redirect off-site.
	 */
	async function continueTo(next: string) {
		if (next.startsWith('/oauth/')) location.assign(next);
		else await goto(next, { invalidateAll: true });
	}

	async function passkeySignIn() {
		passkeyError = '';
		passkeyBusy = true;
		try {
			const result = await signInWithPasskey();
			if (!result.ok) {
				if (result.error) passkeyError = result.error;
				return;
			}
			await continueTo(data.next);
		} finally {
			passkeyBusy = false;
		}
	}

	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				await continueTo(result.location);
				return;
			}
			// Re-running the load deals a fresh grid: each one takes one answer.
			await update();
			busy = false;
			attempt++;
		};
	};
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
		{#if data.next.startsWith('/oauth/')}
			<p class="mt-2 text-center text-sm text-text-muted">to continue to Cloudflare Access</p>
		{/if}

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
			<span class="text-xs text-text-subtle">No device with you?</span>
			<span class="h-px flex-1 bg-border-subtle"></span>
		</div>

		<div
			role="tablist"
			aria-label="Other ways to sign in"
			class="mb-4 grid grid-cols-3 gap-1 rounded-[var(--radius-ui)] bg-surface-sunken p-1"
		>
			{#each [['password', 'Puzzle'], ['recovery', 'Recovery code'], ['token', 'Token']] as [value, label] (value)}
				{#if value !== 'token' ? data.password : true}
					<button
						type="button"
						role="tab"
						aria-selected={door === value}
						onclick={() => (chosen = value as Door)}
						class="h-8 rounded-[var(--radius-ui-sm)] text-xs font-medium text-text-muted transition-colors duration-150 ease-out aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-[0_0_0_1px_var(--border-subtle)] pointer-coarse:h-10"
					>
						{label}
					</button>
				{/if}
			{/each}
		</div>

		{#if form?.retryAt && form.door === door}
			<p role="alert" class="mb-3 text-center text-xs text-danger">
				Locked until {fmtTime(form.retryAt)}. A passkey still works.
			</p>
		{/if}

		{#if door === 'password' && data.puzzle}
			<form method="POST" action={action('password')} class="flex flex-col gap-4" use:enhance={submit}>
				<input type="hidden" name="challenge" value={data.puzzle.token} />

				<Field id="password" label="Password">
					{#snippet children({ id, describedBy })}
						<input
							{id}
							name="password"
							type="password"
							autocomplete="current-password"
							aria-describedby={describedBy}
							required
							class={fieldClass()}
						/>
					{/snippet}
				</Field>

				<div class="flex flex-col gap-2">
					<span id="puzzle-label" class="text-sm font-medium">Puzzle</span>
					<!-- Labels on the edges so the route written down at setup
					     (`A1 B2 …`) can be found; the digits change every time. -->
					<div
						class="grid grid-cols-[1rem_repeat(4,minmax(0,1fr))] gap-1.5 text-center select-none"
						aria-labelledby="puzzle-label"
						role="group"
					>
						<span></span>
						{#each COLS as c (c)}
							<span class="text-2xs text-text-subtle">{c}</span>
						{/each}
						{#each [0, 1, 2, 3] as row (row)}
							<span class="self-center text-2xs text-text-subtle">{row + 1}</span>
							{#each [0, 1, 2, 3] as col (col)}
								<span
									class="grid aspect-square place-items-center rounded-[var(--radius-ui-sm)] bg-surface-sunken font-mono text-lg font-medium tabular-nums"
									aria-label="{COLS[col]}{row + 1}: {data.puzzle.grid[row * 4 + col]}"
								>
									{data.puzzle.grid[row * 4 + col]}
								</span>
							{/each}
						{/each}
					</div>
				</div>

				<Field id="answer" label="Your route's digits" error={errorFor('password')}>
					{#snippet children({ id, describedBy, invalid })}
						<input
							{id}
							name="answer"
							inputmode="numeric"
							autocomplete="off"
							spellcheck="false"
							aria-describedby={describedBy}
							aria-invalid={invalid || undefined}
							required
							class="{fieldClass(invalid)} font-mono tracking-[0.2em]"
						/>
					{/snippet}
				</Field>

				{#if data.turnstileSiteKey}
					<div use:turnstile={{ siteKey: data.turnstileSiteKey, attempt }}></div>
				{/if}

				<Button type="submit" variant="secondary" size="lg" {busy} busyLabel="Checking…">
					Sign in for an hour
				</Button>
				<p class="text-center text-xs text-pretty text-text-muted">
					A limited session: no security changes, no deleting. You will get an alert.
				</p>
			</form>
		{:else if door === 'recovery' && data.password}
			<form method="POST" action={action('recovery')} class="flex flex-col gap-4" use:enhance={submit}>
				<Field id="rc-password" label="Password">
					{#snippet children({ id, describedBy })}
						<input
							{id}
							name="password"
							type="password"
							autocomplete="current-password"
							aria-describedby={describedBy}
							required
							class={fieldClass()}
						/>
					{/snippet}
				</Field>

				<Field id="code" label="Recovery code" error={errorFor('recovery')} hint="From your printed sheet. Each works once.">
					{#snippet children({ id, describedBy, invalid })}
						<input
							{id}
							name="code"
							autocomplete="one-time-code"
							autocapitalize="characters"
							spellcheck="false"
							placeholder="XXXXX-XXXXX"
							aria-describedby={describedBy}
							aria-invalid={invalid || undefined}
							required
							class="{fieldClass(invalid)} font-mono uppercase"
						/>
					{/snippet}
				</Field>

				{#if data.turnstileSiteKey}
					<div use:turnstile={{ siteKey: data.turnstileSiteKey, attempt }}></div>
				{/if}

				<Button type="submit" variant="secondary" size="lg" {busy} busyLabel="Checking…">
					Sign in with recovery code
				</Button>
			</form>
		{:else}
			<form method="POST" action={action('token')} class="flex flex-col gap-3" use:enhance={submit}>
				<Field id="token" label="Token" error={errorFor('token')}>
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

				<Button type="submit" variant="secondary" size="lg" {busy} busyLabel="Checking…">
					Sign in with token
				</Button>
			</form>
		{/if}
	</div>
</main>
