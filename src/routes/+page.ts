/**
 * The public artifact ships no framework JavaScript (§14). Everything on this
 * page is server-rendered HTML and CSS; the prose, the link-button press
 * states, the dark-mode swap and the contribution graph all survive
 * `csr = false` because none of them were built on hydration in the first place.
 *
 * The one behaviour that genuinely needs script — collapsing a failed image —
 * is wired by `/w.js`, loaded only when the rendered document contains an image.
 */
export const csr = false;
