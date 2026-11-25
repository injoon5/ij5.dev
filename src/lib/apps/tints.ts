import type { Tint } from '$lib/apps/app';

/**
 * What each tint looks like in a browser: Apple's system colours in light
 * mode. The phone uses the real `Color.red` and so on, which shift a little in
 * dark mode; this is a preview, close enough to choose by.
 */
export const TINT_HEX: Record<Tint, string> = {
	red: '#ff3b30',
	orange: '#ff9500',
	yellow: '#ffcc00',
	green: '#34c759',
	mint: '#00c7be',
	teal: '#30b0c7',
	cyan: '#32ade6',
	blue: '#007aff',
	indigo: '#5856d6',
	purple: '#af52de',
	pink: '#ff2d55',
	brown: '#a2845e',
	gray: '#8e8e93'
};
