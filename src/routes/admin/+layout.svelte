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
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin">
	<a href="#content" class="skip">Skip to content</a>

	<!--
		A persistent sidebar at `md` and up, a bottom bar below it. Not a
		hamburger in either case: three destinations do not need to be hidden
		behind a menu, and on a phone the thumb is at the bottom of the screen.
	-->
	<nav class="sidebar" aria-label="Admin">
		<a
			href="/"
			class="hidden px-3 text-sm font-semibold md:block"
			aria-label="ij5.dev — back to the homepage"
		>
			ij5.dev
		</a>

		<ul class="nav-list">
			{#each NAV as item (item.href)}
				{@const Icon = item.icon}
				<li>
					<a
						href={item.href}
						aria-current={isActive(item.href) ? 'page' : undefined}
						class="nav-link"
					>
						<Icon size={17} aria-hidden="true" />
						<span>{item.label}</span>
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
		<form method="POST" action="/logout" class="signout">
			<button class="nav-link w-full" type="submit">
				<LogOut size={17} aria-hidden="true" />
				<span>Sign out</span>
			</button>
		</form>
	</nav>

	<main class="content" id="content" tabindex="-1">
		{@render children()}
	</main>
</div>

<style>
	.admin {
		min-height: 100dvh;
	}

	/* Seven nav stops sit before the content on every screen. */
	.skip {
		position: fixed;
		top: 0.5rem;
		left: 0.5rem;
		z-index: 40;
		border-radius: var(--radius-ui);
		background-color: var(--surface);
		box-shadow: var(--shadow-pop);
		padding: 0.625rem 0.875rem;
		font-size: var(--text-sm);
		font-weight: 500;
		transform: translateY(calc(-100% - 1rem));
		transition: transform 150ms var(--ease-out);
	}

	.skip:focus-visible {
		transform: none;
	}

	.content:focus {
		outline: none;
	}

	.sidebar {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 20;
		display: flex;
		background-color: var(--surface);
		border-top: 1px solid var(--border-subtle);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.nav-list {
		display: flex;
		flex: 1;
	}

	.signout {
		display: flex;
	}

	.nav-list :global(li) {
		flex: 1;
	}

	.nav-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		/* 44px minimum, made of padding rather than a bigger icon. */
		min-height: 3.25rem;
		/* Seven destinations with labels cannot clear 320px, so below `md`
		   the bar is icons only (labels stay for screen readers and return in
		   the sidebar) and every stop is visible at once. */
		padding-inline: 0.25rem;
		font-size: var(--text-2xs);
		font-weight: 500;
		color: var(--text-muted);
		flex-direction: column;
		gap: 0.25rem;
		transition: color 150ms var(--ease-out);
	}

	@media (max-width: 767.98px) {
		.nav-link span {
			display: none;
		}
	}

	.nav-link[aria-current='page'] {
		color: var(--text);
	}

	.content {
		padding: 1.5rem 1rem calc(5rem + env(safe-area-inset-bottom));
	}

	@media (min-width: 768px) {
		.admin {
			display: grid;
			grid-template-columns: 15rem 1fr;
		}

		.sidebar {
			position: sticky;
			inset: 0 auto auto 0;
			top: 0;
			height: 100dvh;
			flex-direction: column;
			gap: 1.5rem;
			padding: 1.75rem 0.75rem 1.75rem;
			border-top: 0;
			border-right: 1px solid var(--border-subtle);
			background-color: transparent;
		}

		.nav-list {
			flex-direction: column;
			flex: 0;
			gap: 0.125rem;
		}

		.signout {
			margin-top: auto;
		}

		.nav-link {
			flex-direction: row;
			justify-content: flex-start;
			min-height: 2.25rem;
			padding-inline: 0.75rem;
			gap: 0.625rem;
			border-radius: var(--radius-ui);
			font-size: var(--text-sm);
		}

		/* An iPad or landscape phone is still touch; the sidebar links get the
		   finger-minimum there too. */
		@media (pointer: coarse) {
			.nav-link {
				min-height: 2.75rem;
			}
		}

		.nav-link[aria-current='page'] {
			background-color: var(--surface);
		}

		@media (hover: hover) and (pointer: fine) {
			.nav-link:hover {
				color: var(--text);
			}
		}

		.content {
			padding: 2.5rem 2.5rem 4rem;
			min-width: 0;
		}
	}
</style>
