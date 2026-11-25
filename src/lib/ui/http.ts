/** The sentence a failed JSON endpoint sent back: SvelteKit's `error()` writes
 *  `message`, the API helpers write `error`. The hook's bare-text 401 means the
 *  session lapsed while the page sat open. Anything else gets the fallback. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
	try {
		const body = (await res.json()) as { message?: string; error?: string };
		if (body.message || body.error) return (body.message || body.error) as string;
	} catch {
		// Not JSON.
	}
	return res.status === 401 ? 'Your session has expired. Sign in again.' : fallback;
}
