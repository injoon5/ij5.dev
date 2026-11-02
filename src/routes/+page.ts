/**
 * The public artifact ships no framework JavaScript (§14). Everything on this
 * page is server-rendered HTML and CSS; the prose, the link-button press
 * states, the dark-mode swap and the contribution graph all survive
 * `csr = false` because none of them were built on hydration in the first place.
 *
 * The few behaviours that genuinely need script — collapsing a failed image,
 * fading the graph's clipped edge, letting iOS show a button press — are
 * wired by `/w.js`, loaded only when the document has something that uses one.
 */
export const csr = false;
