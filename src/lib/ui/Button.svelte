<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md';

	type Props = {
		variant?: Variant;
		size?: Size;
		href?: string;
		/** In flight. Disables the button and announces it, without moving it. */
		busy?: boolean;
		/**
		 * What to say while busy. A button that keeps its resting label and only
		 * dims is indistinguishable from one that is disabled for some other
		 * reason, so the verb changes tense: Publish → Publishing…
		 */
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
		primary: 'bg-accent text-accent-contrast hover:bg-accent-hover',
		// The same inset hairline the inputs use, not a contact shadow. A
		// secondary button is `bg-surface`, so on the page background it read as
		// a raised control and inside a `bg-surface` panel it disappeared into
		// its own container — "Save identity" was white on white with a 1px
		// shadow for an edge. An input beside it in the same form already solved
		// this; a button and a text field sitting in one form should not be
		// built out of different materials.
		secondary:
			'bg-surface text-text shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:bg-surface-hover',
		ghost: 'text-text-muted hover:bg-surface hover:text-text',
		danger: 'bg-danger-tint text-danger hover:bg-danger hover:text-white'
	};

	// 44px minimum on touch, tightened at `sm` where a pointer is available.
	const SIZE: Record<Size, string> = {
		sm: 'h-11 px-3 text-sm sm:h-8',
		md: 'h-11 px-4 text-sm sm:h-9'
	};

	const base =
		'inline-flex select-none items-center justify-center gap-1.5 rounded-[var(--radius-ui)] font-medium whitespace-nowrap transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45';

	// The two labels share one grid cell, so the button is always as wide as the
	// longer of them and swapping between them cannot resize it mid-press. The
	// swap is a cross-fade rather than a cut, and opacity is one of the few
	// things that still transitions under reduced motion.
	const stack = 'col-start-1 row-start-1 flex items-center gap-1.5 transition-opacity duration-150 ease-out';
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
	<a {href} class="{base} {VARIANT[variant]} {SIZE[size]} {extra}" {...rest}>
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
