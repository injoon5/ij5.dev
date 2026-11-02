import { goto } from '$app/navigation';

/**
 * The keyboard on a list screen: `n` opens a new item, `/` focuses the
 * filter, `Esc` closes the side panel. Never while typing in a field, and
 * never with a modifier — `⌘N` and friends belong to the browser.
 */
export function listShortcuts(
	base: string,
	state: () => { open: boolean; search: HTMLInputElement | null | undefined }
) {
	return (event: KeyboardEvent) => {
		if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;

		const el = event.target as HTMLElement | null;
		if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;

		const { open, search } = state();
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			goto(base, { noScroll: true });
		} else if (event.key === 'n') {
			event.preventDefault();
			goto(`${base}?s=new`, { noScroll: true });
		} else if (event.key === '/' && search) {
			event.preventDefault();
			search.focus();
		}
	};
}
