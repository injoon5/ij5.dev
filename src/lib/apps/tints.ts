import { DEFAULT_TINT, type Tint } from '$lib/apps/app';

/**
 * What each tint looks like in a browser: Apple's system colours in light
 * mode. The phone uses the real `Color.red` and so on, which shift a little in
 * dark mode; this is a preview, close enough to choose by.
 */
const TINT_HEX: Record<Tint, string> = {
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

/** A stored tint's colour; anything unknown shows as the default. */
export const tintHex = (tint: string) => TINT_HEX[tint as Tint] ?? TINT_HEX[DEFAULT_TINT];
