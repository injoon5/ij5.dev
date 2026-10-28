/**
 * The handful of class strings that would otherwise drift between screens.
 * Kept as constants rather than components because an `<input>` wrapped in a
 * component loses the native attributes forms depend on.
 */

const inputBase =
	'w-full rounded-[var(--radius-ui)] bg-surface px-3 py-2 text-text transition-shadow duration-150 ease-out placeholder:text-text-subtle focus-visible:outline-none pointer-fine:py-[0.4375rem] pointer-fine:text-sm';

/** The border and focus ring are the only things that change between a valid
 *  and an invalid field. Both strings are written out in full: Tailwind finds
 *  classes by scanning source text, so a class assembled from a template
 *  literal is never generated — which is how the invalid border went missing. */
export function inputClass(invalid = false): string {
	return invalid
		? `${inputBase} shadow-[inset_0_0_0_1px_var(--danger)]`
		: `${inputBase} shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:shadow-[inset_0_0_0_1px_var(--border-strong)] focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-tint)]`;
}

export const fieldClass = (invalid = false) => inputClass(invalid);

/** A panel's surface: on a phone a white group on the gray canvas,
 *  borderless like a grouped list; on the white desktop canvas a hairline
 *  draws it. No padding — for lists and strips that run edge to edge. */
export const cardFlush =
	'overflow-hidden rounded-[var(--radius-ui-lg)] bg-surface md:border md:border-border-subtle';

/** The same panel with its content inset. */
export const card = `${cardFlush} p-4 md:p-5`;

/** The heading inside a `card`. */
export const cardTitle = 'text-sm font-semibold';

/* ---------------------------------------------------------------------------
   Tables
   Links, Pastes and Files are the same shape, tailored twice. On a wide
   screen: a header row of column names, hairline rows edge to edge, the
   selected row tinted. On a phone: an inset group of two-line rows on the
   gray canvas — what it is and where it points on the left, its numbers on
   the right — at a size a thumb and a glance both get right.
--------------------------------------------------------------------------- */

/** Wraps the header and the rows. */
export const table =
	'mx-4 overflow-hidden rounded-[var(--radius-ui-lg)] bg-surface md:mx-0 md:rounded-none md:border-t md:border-border-subtle';

/** The column-name row. Each table appends its own `md:grid-cols-…`. */
export const tableHead =
	'hidden h-9 items-center gap-4 border-b border-border-subtle px-6 text-xs text-text-subtle md:grid';

/** The `<ul>` of rows: separators between rows in the phone's group. */
export const tableBody = 'divide-y divide-border-subtle md:divide-y-0';

/** A row. Each table appends the same `md:grid-cols-…` as its header. */
export const tableRow =
	'grid min-h-[3.25rem] grid-cols-[minmax(0,1fr)_auto] content-center items-center gap-x-4 gap-y-px px-4 py-2 transition-colors duration-100 ease-out active:bg-row-active aria-[current=true]:bg-row-active md:h-11 md:min-h-0 md:gap-y-0 md:border-b md:border-border-subtle md:px-6 md:py-0 md:hover:bg-row-hover';

/** The first line of a row: its name. */
export const rowTitle = 'text-[0.9375rem] font-medium md:text-sm';

/** The second line on a phone, a column on a wide screen. */
export const rowSub = 'truncate text-sm text-text-muted';

/** The small pill on a row (Expired, 301). */
export const badge =
	'inline-flex shrink-0 items-center rounded-[var(--radius-pill)] bg-surface-sunken px-1.5 py-px text-2xs font-medium text-text-muted';

/** An inline keycap in help text. */
export const kbd =
	'inline-grid min-w-[1.25rem] place-items-center rounded-[5px] border border-border-subtle bg-surface px-1 font-mono text-2xs text-text-muted';

/** A square, icon-only control: 36px on touch, 32px under a mouse. */
export const iconButton =
	'relative grid size-9 shrink-0 place-items-center rounded-[var(--radius-ui-sm)] text-text-muted transition-[background-color,color,scale] duration-150 ease-out hover:bg-row-active hover:text-text active:scale-[0.96] pointer-fine:size-8';

/** A status line after an action: success or failure. */
export const notice = {
	ok: 'rounded-[var(--radius-ui)] bg-accent-tint px-3 py-2 text-sm text-accent',
	error: 'rounded-[var(--radius-ui)] bg-danger-tint px-3 py-2 text-sm text-danger'
};

/**
 * A field with a fixed prefix inside its border (`ij5.dev/` before a slug).
 * The wrapper draws the border and the focus ring, so the prefix reads as part
 * of the field rather than a label floating beside it.
 */
export function affixClass(invalid = false): string {
	const base =
		'flex w-full items-center rounded-[var(--radius-ui)] bg-surface transition-shadow duration-150 ease-out';
	return invalid
		? `${base} shadow-[inset_0_0_0_1px_var(--danger)]`
		: `${base} shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:shadow-[inset_0_0_0_1px_var(--border-strong)] focus-within:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-tint)]`;
}

export const affixPrefix = 'shrink-0 ps-3 text-text-subtle select-none pointer-fine:text-sm';

export const affixInput =
	'min-w-0 flex-1 bg-transparent py-2 ps-0.5 pe-3 text-text placeholder:text-text-subtle focus-visible:outline-none pointer-fine:py-[0.4375rem] pointer-fine:text-sm';

/**
 * A checkbox drawn as a switch (`role="switch"` on the input): the native
 * control is kept, so keyboard, form submission and no-JS all still work.
 */
export const switchClass =
	"relative h-[1.625rem] w-[2.75rem] shrink-0 cursor-pointer appearance-none rounded-full bg-border-strong transition-[background-color] duration-200 ease-out before:absolute before:top-[3px] before:left-[3px] before:size-5 before:rounded-full before:bg-white before:shadow-[0_1px_3px_oklch(0_0_0/0.2)] before:transition-transform before:duration-200 before:ease-[cubic-bezier(0.32,0.72,0,1)] before:content-[''] checked:bg-accent checked:before:translate-x-[1.125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-fine:h-5 pointer-fine:w-9 pointer-fine:before:top-0.5 pointer-fine:before:left-0.5 pointer-fine:before:size-4 pointer-fine:checked:before:translate-x-4";
