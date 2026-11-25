/**
 * Cloudflare Turnstile as a Svelte action, for the login page's password doors
 * (`$lib/auth/turnstile.server`). The widget writes its token into a hidden
 * `cf-turnstile-response` input inside the node, so the form posts it with no
 * extra wiring. A token is single-use: bump `attempt` after every submission
 * and the widget fetches a new one.
 */

type Api = {
	render: (el: HTMLElement, opts: Record<string, unknown>) => string;
	reset: (id: string) => void;
	remove: (id: string) => void;
};

declare global {
	interface Window {
		turnstile?: Api;
	}
}

let loading: Promise<Api> | null = null;

function load(): Promise<Api> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	loading ??= new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		s.async = true;
		s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load.')));
		s.onerror = () => {
			loading = null;
			reject(new Error('Turnstile did not load.'));
		};
		document.head.append(s);
	});
	return loading;
}

export function turnstile(node: HTMLElement, params: { siteKey: string; attempt: number }) {
	let id: string | null = null;
	let gone = false;
	let last = params.attempt;

	load()
		.then((api) => {
			if (!gone) id = api.render(node, { sitekey: params.siteKey, size: 'flexible', appearance: 'interaction-only' });
		})
		.catch(() => {});

	return {
		update(next: { siteKey: string; attempt: number }) {
			if (next.attempt !== last && id) window.turnstile?.reset(id);
			last = next.attempt;
		},
		destroy() {
			gone = true;
			if (id) window.turnstile?.remove(id);
		}
	};
}
