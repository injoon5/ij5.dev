<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md';

	type Props = {
		variant?: Variant;
		size?: Size;
		href?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'size'>;

	let {
		variant = 'secondary',
		size = 'md',
		href,
		class: extra = '',
		children,
		...rest
	}: Props = $props();

	// Only the primary action gets a filled background. Several coloured
	// controls in one view is how an accent stops carrying meaning.
	const VARIANT: Record<Variant, string> = {
		primary: 'bg-accent text-accent-contrast hover:bg-accent-hover',
		secondary:
			'bg-surface text-text shadow-[0_1px_2px_oklch(0_0_0/0.05)] hover:bg-surface-hover',
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
</script>

{#if href}
	<a {href} class="{base} {VARIANT[variant]} {SIZE[size]} {extra}" {...rest}>
		{@render children()}
	</a>
{:else}
	<button class="{base} {VARIANT[variant]} {SIZE[size]} {extra}" {...rest}>
		{@render children()}
	</button>
{/if}
