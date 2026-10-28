<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'form' | 'lg';

	type Props = {
		variant?: Variant;
		size?: Size;
		href?: string;
		/** In flight. Disables the button and announces it, without moving it. */
		busy?: boolean;
		/** Label while busy, so the verb changes tense: Publish → Publishing… */
		busyLabel?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'size'>;

	let {
		variant = 'secondary',
		size = 'md',
		href,
		busy = false,
		busyLabel,
		disabled,
		class: extra = '',
		children,
		...rest
	}: Props = $props();

	// Only the primary action gets a filled background. Several coloured
	// controls in one view is how an accent stops carrying meaning.
	const VARIANT: Record<Variant, string> = {
		primary: 'bg-accent text-accent-contrast shadow-[inset_0_1px_0_oklch(1_0_0/0.12)] hover:bg-accent-hover',
		// The inset hairline the inputs use, so it holds an edge on the page
		// background and inside a `bg-surface` panel alike.
		secondary:
			'bg-surface text-text shadow-[inset_0_0_0_1px_var(--border-subtle),0_1px_1px_oklch(0_0_0/0.03)] hover:bg-row-hover hover:shadow-[inset_0_0_0_1px_var(--border-strong)]',
		// The admin canvas is white, so a hover has to darken, not "lift" to
		// the surface colour it is already standing on.
		ghost: 'text-text-muted hover:bg-row-active hover:text-text',
		danger: 'bg-surface text-danger hover:bg-danger-tint md:bg-transparent'
	};

	// Sized for a fingertip on touch (36–44px, the same rhythm as iOS
	// controls) and compact where a fine pointer is actually available.
	const SIZE: Record<Size, string> = {
		sm: 'h-9 rounded-[var(--radius-ui)] px-3 text-sm pointer-fine:h-8',
		md: 'h-10 rounded-[var(--radius-ui)] px-4 text-sm pointer-fine:h-9',
		// A form's own actions: full width on a phone, where they are the last
		// thing on the screen, and a compact button beside its siblings from
		// `md`. 44px is a finger's target, not a thumb-slab.
		form: 'h-11 w-full rounded-[var(--radius-ui)] px-4 text-[0.9375rem] md:h-10 md:w-auto md:px-3 md:text-sm md:pointer-fine:h-8',
		// One full-width action on its own: sign-in.
		lg: 'h-11 w-full rounded-[var(--radius-ui)] px-4 text-[0.9375rem] pointer-fine:h-10 pointer-fine:text-sm'
	};

	const base =
		'inline-flex select-none items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45';

	// Both labels share one grid cell: the button is sized to the longer of the
	// two and cannot resize mid-press.
	const stack = 'col-start-1 row-start-1 flex items-center justify-center gap-1.5 transition-opacity duration-150 ease-out';
</script>

{#snippet label()}
	{#if busyLabel}
		<span class="grid">
			<span class="{stack} {busy ? 'opacity-0' : 'opacity-100'}" aria-hidden={busy || undefined}>
				{@render children()}
			</span>
			<span class="{stack} {busy ? 'opacity-100' : 'opacity-0'}" aria-hidden={!busy || undefined}>
				{busyLabel}
			</span>
		</span>
	{:else}
		{@render children()}
	{/if}
{/snippet}

{#if href}
	<!-- An anchor has no `disabled`, so a busy or disabled link drops its href
	     and stops taking focus or clicks rather than navigating mid-flight. -->
	{@const inert = disabled || busy}
	<a
		href={inert ? undefined : href}
		class="{base} {VARIANT[variant]} {SIZE[size]} {inert ? 'pointer-events-none opacity-45' : ''} {extra}"
		aria-disabled={inert || undefined}
		aria-busy={busy || undefined}
		tabindex={inert ? -1 : undefined}
		{...rest}
	>
		{@render label()}
	</a>
{:else}
	<button
		class="{base} {VARIANT[variant]} {SIZE[size]} {extra}"
		disabled={disabled || busy || undefined}
		aria-busy={busy || undefined}
		{...rest}
	>
		{@render label()}
	</button>
{/if}
