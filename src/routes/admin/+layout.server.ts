import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.session) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	return {
		session: {
			strength: locals.session.strength,
			expiresAt: locals.session.expires_at
		}
	};
};
