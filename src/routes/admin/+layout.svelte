<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import LayoutGrid from 'lucide-svelte/icons/layout-grid';
	import LinkIcon from 'lucide-svelte/icons/link-2';
	import FileText from 'lucide-svelte/icons/file-text';
	import Download from 'lucide-svelte/icons/download';
	import ChartLine from 'lucide-svelte/icons/chart-line';
	import Terminal from 'lucide-svelte/icons/terminal';
	import KeyRound from 'lucide-svelte/icons/key-round';
	import LogOut from 'lucide-svelte/icons/log-out';
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import Ellipsis from 'lucide-svelte/icons/ellipsis';

	let { children }: { children: Snippet } = $props();

	type Item = { href: string; label: string; icon: typeof LinkIcon };

	const links: Item = { href: '/admin', label: 'Links', icon: LinkIcon };
	const pastes: Item = { href: '/admin/pastes', label: 'Pastes', icon: FileText };
	const files: Item = { href: '/admin/files', label: 'Files', icon: Download };
	const home: Item = { href: '/admin/home', label: 'Home', icon: LayoutGrid };
	const analytics: Item = { href: '/admin/analytics', label: 'Analytics', icon: ChartLine };
	const api: Item = { href: '/admin/api', label: 'API', icon: Terminal };
	const security: Item = { href: '/admin/security', label: 'Security', icon: KeyRound };

	// The sidebar groups by what things are — what you share, the site, the
	// settings — and lets the gap between groups do a heading's work.
	const SIDEBAR = [[links, pastes, files], [home, analytics], [api, security]];

	// A phone gets a tab bar, and a tab bar holds five: the four screens used
	// on the go, then "More" for the rest. Eight icons in a row was a bar of
	// unlabelled glyphs nobody could hit or tell apart.
	const TABS = [links, pastes, files, analytics];
	const MORE = [home, api, security];

	let current = $derived(page.url.pathname);
	const isActive = (href: string) =>
		href === '/admin' ? current === href : current === href || current.startsWith(`${href}/`);
	let inMore = $derived(MORE.some((item) => isActive(item.href)));

	let sheet = $state<HTMLDialogElement | null>(null);
	afterNavigate(() => sheet?.close());

	/** A tap on the backdrop is outside the sheet's box. */
	function onbackdrop(event: MouseEvent) {
		const r = sheet?.getBoundingClientRect();
		if (!r) return;
		const inside =
			event.clientX >= r.left &&
			event.clientX <= r.right &&
			event.clientY >= r.top &&
			event.clientY <= r.bottom;
		if (!inside) sheet?.close();
	}

	const sideLink =
		'flex h-8 items-center gap-2.5 rounded-[var(--radius-ui-sm)] px-2.5 text-sm font-medium text-text-muted transition-colors duration-150 ease-out hover:bg-row-active hover:text-text aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-[0_0_0_1px_var(--border-subtle),0_1px_2px_oklch(0_0_0/0.04)] pointer-coarse:h-11';

	// Monochrome: the current tab is full-strength ink, the rest recede. The
	// one accent stays reserved for the primary action and focus.
	const tab =
		'flex min-h-12 flex-1 flex-col items-center justify-center gap-1 pt-0.5 text-[0.625rem] font-medium text-text-subtle transition-colors duration-150 ease-out active:text-text-muted aria-[current=page]:text-text';

	const sheetRow =
		'flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-ui-sm)] px-2.5 text-sm font-medium transition-colors duration-100 ease-out active:bg-row-active';
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-dvh bg-surface md:grid md:grid-cols-[13.5rem_minmax(0,1fr)] md:bg-bg">
	<a
		href="#content"
		class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-[var(--radius-ui)] focus-visible:bg-surface focus-visible:px-3.5 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-[var(--shadow-pop)]"
	>
		Skip to content
	</a>

	<!-- The sidebar, from `md`. -->
	<nav
		aria-label="Admin"
		class="sticky top-0 hidden h-dvh flex-col px-3 pt-3.5 pb-3 md:flex"
	>
		<a
			href="/"
			target="_blank"
			rel="noopener"
			class="group mb-5 flex h-9 items-center gap-2.5 rounded-[var(--radius-ui-sm)] px-1.5 text-sm font-semibold transition-colors duration-150 ease-out hover:bg-row-active"
		>
			<img src="/icon.svg" alt="" width="22" height="22" class="size-[1.375rem] rounded-[6px]" />
			ij5.dev
			<ArrowUpRight
				size={14}
				aria-hidden="true"
				class="ms-auto text-text-subtle opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100"
			/>
			<span class="sr-only">(opens the site in a new tab)</span>
		</a>

		<div class="flex flex-col gap-5">
			{#each SIDEBAR as group, g (g)}
				<ul class="flex flex-col gap-px">
					{#each group as item (item.href)}
						{@const Icon = item.icon}
						<li>
							<a
								href={item.href}
								aria-current={isActive(item.href) ? 'page' : undefined}
								class={sideLink}
							>
								<Icon size={16} aria-hidden="true" />
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			{/each}
		</div>

		<form method="POST" action="/logout" class="mt-auto">
			<button class="{sideLink} w-full" type="submit">
				<LogOut size={16} aria-hidden="true" />
				Sign out
			</button>
		</form>
	</nav>

	<!--
		The canvas. On a phone it is the screen itself, the same white surface
		the desktop panel is. From `md` it is an inset panel that scrolls on
		its own, so the sidebar holds still and a sticky header sticks to the
		panel rather than sliding under the window's edge.
	-->
	<main
		id="content"
		tabindex="-1"
		class="min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] focus:outline-none md:m-2 md:ms-0 md:h-[calc(100dvh-1rem)] md:overflow-y-auto md:rounded-[var(--radius-ui-lg)] md:border md:border-border-subtle md:bg-surface md:pb-0 md:shadow-[0_1px_3px_oklch(0_0_0/0.03)]"
	>
		{@render children()}
	</main>

	<!-- The tab bar, below `md`. -->
	<nav
		aria-label="Admin"
		class="fixed inset-x-0 bottom-0 z-30 flex border-t border-border-subtle bg-surface px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
	>
		{#each TABS as item (item.href)}
			{@const Icon = item.icon}
			<a href={item.href} aria-current={isActive(item.href) ? 'page' : undefined} class={tab}>
				<Icon size={19} aria-hidden="true" />
				{item.label}
			</a>
		{/each}
		<button
			type="button"
			class={tab}
			aria-current={inMore ? 'page' : undefined}
			aria-haspopup="dialog"
			onclick={() => sheet?.showModal()}
		>
			<Ellipsis size={19} aria-hidden="true" />
			More
		</button>
	</nav>
</div>

<!--
	"More": a compact menu that grows out of the More tab — origin bottom
	right, where the finger is — with the rest of the destinations and
	sign-out under a separator. Same open/close mechanics as the analytics
	sheet: `transition-discrete` and `starting:`, no JS beyond showing it.
-->
<dialog
	bind:this={sheet}
	aria-label="More"
	onclick={onbackdrop}
	class="fixed inset-auto right-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] m-0 w-56 origin-bottom-right scale-95 rounded-[var(--radius-ui-lg)] border-0 bg-surface p-1 text-text opacity-0 shadow-[var(--shadow-pop)] transition-[opacity,scale,display,overlay] duration-150 ease-out transition-discrete open:scale-100 open:opacity-100 backdrop:bg-transparent starting:open:scale-95 starting:open:opacity-0 md:hidden"
>
	<ul>
		{#each MORE as item (item.href)}
			{@const Icon = item.icon}
			<li>
				<a
					href={item.href}
					aria-current={isActive(item.href) ? 'page' : undefined}
					class="{sheetRow} aria-[current=page]:bg-row-active"
				>
					<Icon size={16} aria-hidden="true" class="text-text-muted" />
					{item.label}
				</a>
			</li>
		{/each}
		<li>
			<a href="/" target="_blank" rel="noopener" class={sheetRow}>
				<ArrowUpRight size={16} aria-hidden="true" class="text-text-muted" />
				View site
			</a>
		</li>
	</ul>
	<div class="mx-2 my-1 h-px bg-border-subtle" role="separator"></div>
	<form method="POST" action="/logout">
		<button type="submit" class="{sheetRow} text-danger">
			<LogOut size={16} aria-hidden="true" />
			Sign out
		</button>
	</form>
</dialog>
