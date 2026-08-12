<script lang="ts">
	import { page } from '$app/state';

	/**
	 * Not a framework default. This is the page people reach when they mistype
	 * a link you shared, when a slug has expired, and when KV is having a bad
	 * day — so it says what happened and offers the one thing that always
	 * works.
	 *
	 * Everything here is type and layout with no network assets, so it renders
	 * intact offline.
	 */
	const COPY: Record<number, { title: string; body: string }> = {
		404: {
			title: 'Nothing at this address',
			body: 'That link may have expired, or it may never have existed. Either way it is not here now.'
		},
		401: { title: 'Not signed in', body: 'This page needs a session.' },
		500: {
			title: 'Something broke on our side',
			body: 'This is being recorded. Trying again in a moment usually works.'
		}
	};

	let copy = $derived(
		COPY[page.status] ?? { title: 'Something went wrong', body: page.error?.message ?? '' }
	);
</script>

<svelte:head>
	<title>{copy.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="grid min-h-dvh place-items-center px-6 py-16">
	<div class="max-w-[38ch] text-center">
		<p class="tnum text-sm font-medium text-text-subtle">{page.status}</p>
		<h1 class="mt-2 text-2xl font-semibold text-balance">{copy.title}</h1>
		<p class="mt-2 text-base text-pretty text-text-muted">{copy.body}</p>

		<a
			href="/"
			class="mt-7 inline-flex h-11 items-center rounded-[var(--radius-ui)] bg-accent px-4 text-sm font-medium text-accent-contrast transition-[background-color,scale] duration-150 ease-out hover:bg-accent-hover active:scale-[0.97]"
		>
			Go to the homepage
		</a>
	</div>
</main>
