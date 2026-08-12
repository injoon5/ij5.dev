/**
 * The public artifact ships no framework JavaScript (§14). Everything on this
 * page is server-rendered HTML and CSS; the sticky rail, the press states, the
 * dark mode swap and the grid all survive `csr = false` because none of them
 * were built on hydration in the first place.
 *
 * The handful of widgets that genuinely need behaviour — copy to clipboard,
 * embed facades — are wired by `/w.js`, which is loaded only when a block on
 * the page actually needs it.
 */
export const csr = false;
