/**
 * Where to go after signing in (§4). The login page takes a `next` so the OIDC
 * flow can come back to `/oauth/authorize`; anything that is not that or the
 * admin collapses to `/admin`, so the parameter can never send anyone off-site.
 */

export function safeNext(raw: string | null): string {
	if (!raw) return '/admin';
	try {
		const u = new URL(raw, 'http://n.invalid');
		if (u.origin !== 'http://n.invalid') return '/admin';
		if (u.pathname === '/oauth/authorize' || u.pathname === '/admin' || u.pathname.startsWith('/admin/')) {
			return u.pathname + u.search;
		}
	} catch {
		// fall through
	}
	return '/admin';
}

