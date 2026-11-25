/**
 * Cloudflare Turnstile in front of the password doors, when configured.
 *
 * The lockout in `throttle.ts` is what bounds guessing; Turnstile makes each
 * guess cost a real browser, which mostly protects the *global* lock from
 * being tripped by a script to keep you out. Optional: with neither
 * `TURNSTILE_SITE_KEY` nor `TURNSTILE_SECRET` set, the doors work without it.
 */

type Env = App.Platform['env'];

export const turnstileEnabled = (env: Env | undefined) =>
	Boolean(env?.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET);

export async function turnstileOk(env: Env, token: string, ip: string | null): Promise<boolean> {
	if (!turnstileEnabled(env)) return true;
	if (!token) return false;
	const body = new FormData();
	body.set('secret', env.TURNSTILE_SECRET!);
	body.set('response', token);
	if (ip) body.set('remoteip', ip);
	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			body
		});
		const out = (await res.json()) as { success?: boolean };
		return out.success === true;
	} catch {
		// Turnstile down is not a reason to stay locked out: the throttle still
		// stands behind this.
		return true;
	}
}
