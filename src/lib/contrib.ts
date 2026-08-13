/**
 * The GitHub contribution graph, drawn as CSS-grid cells rather than an SVG or
 * an image — the same technique the old `Grass` widget used, ported to a plain
 * HTML string so the Markdown renderer can splice it into the prose.
 *
 * The public page ships no framework JavaScript, so this is static markup:
 * one `<i>` per day, each carrying a level, coloured by the `--grass-*` tokens
 * (so it follows dark mode with no second palette). The grid is `aria-hidden`;
 * the caption below it is the accessible version — 350 cells read out one at a
 * time is a denial of service, not a graph.
 */

export type ContribData = {
	days?: Array<{ d: string; c: number; l: number }>;
	total?: number;
};

const numberFmt = new Intl.NumberFormat('en');

/**
 * `data` is the stored live payload (may be empty/undefined before the first
 * refresh, in which case an empty lattice renders as a quiet year rather than a
 * hole). `user` labels the fallback and keys the live lookup.
 */
export function renderContribGraph(data: ContribData | undefined, user: string): string {
	const days = data?.days ?? [];
	// A full year is 53 columns; at the width of a reading column each cell is
	// comfortably tappable, so the whole calendar fits with room to breathe.
	const trimmed = days.slice(-53 * 7);
	const hasData = trimmed.length > 0;

	const cells = hasData
		? trimmed
		: Array.from({ length: 53 * 7 }, () => ({ d: '', c: 0, l: 0 }));

	// Weeks are whatever whole columns the data spans, so partial leading weeks
	// don't push the grid out of its 7-row shape.
	const weeks = Math.ceil(cells.length / 7);

	const grid = cells.map((day) => `<i class="cell" data-level="${day.l}"></i>`).join('');

	const label =
		hasData && data?.total !== undefined
			? `${numberFmt.format(data.total)} contributions in the last year`
			: `@${escapeHtml(user)} on GitHub`;

	// The site's own `/gh` short link, not the profile URL, so the click stays
	// on whichever origin is serving the page (dev and prod alike).
	const href = '/gh';

	return (
		`<a class="contrib" href="${href}" aria-label="${escapeHtml(user)} on GitHub">` +
		`<span class="contrib-mask">` +
		`<span class="contrib-scroll"><span class="contrib-grid" style="--weeks:${weeks}" aria-hidden="true">${grid}</span></span>` +
		`</span>` +
		`<span class="contrib-cap">${label}</span>` +
		`</a>`
	);
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
