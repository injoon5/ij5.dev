/**
 * Whether a request was sent by a page on this same origin. SvelteKit's CSRF
 * protection only covers form-encoded posts; a JSON or binary request riding
 * the session cookie from another site has to be refused by hand.
 */
export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	return Boolean(origin) && origin === new URL(request.url).origin;
}
