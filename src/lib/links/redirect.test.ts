import { describe, expect, it, vi } from 'vitest';
import { serveRedirect } from './redirect.server';

/** The redirect handle with a KV holding `records`, and no edge cache. */
async function visit(path: string, records: Record<string, unknown>, method = 'GET') {
	const resolve = vi.fn(async () => new Response('page', { status: 404 }));
	const event = {
		url: new URL(`https://ij5.dev${path}`),
		request: new Request(`https://ij5.dev${path}`, { method }),
		platform: {
			env: { KV: { get: async (k: string) => records[k] ?? null } },
			context: { waitUntil: () => {} }
		},
		cookies: { get: () => undefined }
	};
	const res = await serveRedirect({ event, resolve } as never);
	return { res, rendered: resolve.mock.calls.length > 0 };
}

const gh = { 'slug:gh': { target: 'https://github.com/injoon5', status: 302, exp: null } };

describe('serveRedirect', () => {
	it('answers a live link with its redirect, before any page renders', async () => {
		const { res, rendered } = await visit('/gh', gh);
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('https://github.com/injoon5');
		expect(rendered).toBe(false);
		expect((await visit('/gh/', gh)).res.status).toBe(302);
	});

	it('falls through to the page for an expired link, an unknown one, and anything that is not a navigation', async () => {
		const expired = { 'slug:gh': { ...gh['slug:gh'], exp: Date.now() - 1 } };
		expect((await visit('/gh', expired)).rendered).toBe(true);
		expect((await visit('/nope', gh)).rendered).toBe(true);
		expect((await visit('/gh', gh, 'POST')).rendered).toBe(true);
	});

	it('never looks up reserved routes or paths that cannot be slugs', async () => {
		const trap = { 'slug:admin': gh['slug:gh'], 'slug:a/b': gh['slug:gh'] };
		expect((await visit('/admin', trap)).rendered).toBe(true);
		expect((await visit('/a/b', trap)).rendered).toBe(true);
		expect((await visit('/robots.txt', trap)).rendered).toBe(true);
	});
});
