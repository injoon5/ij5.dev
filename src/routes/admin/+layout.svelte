<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import LayoutGrid from 'lucide-svelte/icons/layout-grid';
	import LinkIcon from 'lucide-svelte/icons/link-2';
	import FileText from 'lucide-svelte/icons/file-text';
	import Download from 'lucide-svelte/icons/download';
	import ChartLine from 'lucide-svelte/icons/chart-line';
	import Terminal from 'lucide-svelte/icons/terminal';
	import KeyRound from 'lucide-svelte/icons/key-round';
	import LogOut from 'lucide-svelte/icons/log-out';

	let { children }: { children: Snippet } = $props();

	const NAV = [
		{ href: '/admin', label: 'Links', icon: LinkIcon },
		{ href: '/admin/pastes', label: 'Pastes', icon: FileText },
		{ href: '/admin/files', label: 'Files', icon: Download },
		{ href: '/admin/home', label: 'Home', icon: LayoutGrid },
		{ href: '/admin/analytics', label: 'Analytics', icon: ChartLine },
		{ href: '/admin/api', label: 'API', icon: Terminal },
		{ href: '/admin/security', label: 'Security', icon: KeyRound }
	];

	let current = $derived(page.url.pathname);
	const isActive = (href: string) => (href === '/admin' ? current === href : current.startsWith(href));

	// Shared by the nav links and the sign-out button. A column icon-stop on the
	// bottom bar (labels hidden, 52px touch target); a labelled row in the
	// sidebar at `md`. The current stop tints; at `md` it also gets a surface.
	const navLink =
		'flex min-h-13 flex-col items-center justify-center gap-1 px-1 text-2xs font-medium text-text-muted transition-colors duration-150 ease-out hover:text-text aria-[current=page]:text-text md:min-h-9 md:flex-row md:justify-start md:gap-2.5 md:rounded-[var(--radius-ui)] md:px-3 md:text-sm md:pointer-coarse:min-h-11 md:aria-[current=page]:bg-surface md:aria-[current=page]:text-text';
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
	<a
		href="#content"
		class="fixed top-2 left-2 z-40 -translate-y-[calc(100%+1rem)] rounded-[var(--radius-ui)] bg-surface px-3.5 py-2.5 text-sm font-medium shadow-[var(--shadow-pop)] transition-transform duration-150 ease-out focus-visible:translate-y-0"
	>
		Skip to content
	</a>

	<!--
		A persistent sidebar at `md` and up, a bottom bar below it. Not a
		hamburger in either case: this handful of destinations does not need to be
		hidden behind a menu, and on a phone the thumb is at the bottom of the
		screen.
	-->
	<nav
		aria-label="Admin"
		class="fixed inset-x-0 bottom-0 z-20 flex border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] md:sticky md:inset-x-auto md:top-0 md:left-0 md:h-dvh md:flex-col md:gap-6 md:border-t-0 md:border-r md:bg-transparent md:px-3 md:py-7"
	>
		<a
			href="/"
			class="hidden px-3 text-sm font-semibold md:block"
			aria-label="ij5.dev — back to the homepage"
		>
			ij5.dev
		</a>

		<ul class="flex flex-1 md:flex-[0] md:flex-col md:gap-0.5">
			{#each NAV as item (item.href)}
				{@const Icon = item.icon}
				<li class="flex-1">
					<a
						href={item.href}
						aria-current={isActive(item.href) ? 'page' : undefined}
						class={navLink}
					>
						<Icon size={17} aria-hidden="true" />
						<!-- Labels can't clear 320px at seven stops, so the bottom bar is
						     icons only; they return in the sidebar and stay for SRs. -->
						<span class="hidden md:inline">{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>

		<!--
			On the bottom bar too, not just the sidebar. It was desktop-only, which
			left a phone with no way to sign out at all — and "nothing important
			lives behind a breakpoint" is the same rule as "nothing important lives
			behind hover".
		-->
		<form method="POST" action="/logout" class="flex md:mt-auto">
			<button class="{navLink} w-full" type="submit">
				<LogOut size={17} aria-hidden="true" />
				<span class="hidden md:inline">Sign out</span>
			</button>
		</form>
	</nav>

	<main
		class="px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] focus:outline-none md:min-w-0 md:px-10 md:pt-10 md:pb-16"
		id="content"
		tabindex="-1"
	>
		{@render children()}
	</main>
</div>
