/**
 * The handful of class strings that would otherwise drift between screens.
 * Kept as constants rather than components because an `<input>` wrapped in a
 * component loses the native attributes forms depend on.
 */

/** The border token and the focus accent are the only two things that change
 *  between a valid and invalid field, so one template builds both rather than
 *  two strings that could drift. */
export function inputClass(invalid = false): string {
	const border = invalid ? 'var(--danger)' : 'var(--border-subtle)';
	const focus = invalid ? '' : 'focus:shadow-[inset_0_0_0_1px_var(--accent)] ';
	return `w-full rounded-[var(--radius-ui)] bg-surface px-3 py-2.5 text-text shadow-[inset_0_0_0_1px_${border}] transition-shadow duration-150 ease-out placeholder:text-text-subtle ${focus}focus-visible:outline-none pointer-fine:py-2`;
}

export const fieldClass = (invalid = false) => inputClass(invalid);

export const card = 'rounded-[var(--radius-ui-lg)] bg-surface p-5';

/* ---------------------------------------------------------------------------
   Master–detail lists
   The Links, Pastes and Files screens are the same shape: a single column that
   becomes a list plus a sticky detail pane at `lg`. Below `lg` it is a
   drill-down — a `data-detail` attribute on the layout hides whichever pane is
   not showing. These live here, not copied into three route files, because
   that is exactly the drift this module exists to prevent.
--------------------------------------------------------------------------- */

export const masterLayout =
	'group/layout grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start';

/** The list pane: hidden below `lg` while a detail is open, always shown at `lg`. */
export const listPane = 'group-data-[detail]/layout:hidden lg:block';

/** The detail pane: shown below `lg` only while open, a sticky card at `lg`. */
export const detailAside =
	'hidden group-data-[detail]/layout:block lg:sticky lg:top-10 lg:block lg:rounded-[var(--radius-ui-lg)] lg:bg-surface lg:p-5';

/** The back link that returns to the list below `lg`, where the list is hidden. */
export const backLink =
	'-mt-2 -ms-1 mb-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm font-medium text-text-muted transition-colors duration-150 ease-out hover:text-text lg:hidden';

/** A tappable list row: a two-column card on a phone. Each list appends its own
 *  `md:grid-cols-…` for the columns a wider screen has room for. */
export const dataRow =
	'grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-[var(--radius-ui-lg)] bg-surface px-4 py-3.5 transition-[background-color,scale] duration-150 ease-out hover:bg-surface-hover active:scale-[0.99] aria-[current=true]:shadow-[inset_0_0_0_1px_var(--accent)] md:min-h-10 md:items-center md:gap-4 md:py-2.5';

/** The small pill on a list row (Expired, 301, a file extension). */
export const badge =
	'rounded-[var(--radius-pill)] bg-surface-sunken px-[0.4375rem] py-px text-2xs font-medium text-text-muted';

/** An inline keycap in help text. */
export const kbd = 'rounded-[4px] bg-surface-sunken px-[0.3125rem] py-px font-mono text-2xs';
