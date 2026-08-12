import { describe, expect, it } from 'vitest';
import { OTHER, bucket404, deviceClass, referrerHost, today, visitorHash } from './track';

/**
 * §6's bucketing, which is the whole defence against the `hits` table growing
 * a dimension it cannot afford. Cardinality is decided here, before the write.
 */

describe('deviceClass', () => {
	it('classifies phones', () => {
		expect(
			deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile/15E148')
		).toBe('mobile');
		expect(deviceClass('Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36')).toBe('mobile');
	});

	it('classifies desktops', () => {
		expect(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')).toBe(
			'desktop'
		);
	});

	it('classifies crawlers and preview fetchers as bots', () => {
		for (const ua of [
			'Googlebot/2.1 (+http://www.google.com/bot.html)',
			'facebookexternalhit/1.1',
			'Slackbot-LinkExpanding 1.0',
			'curl/8.4.0'
		]) {
			expect(deviceClass(ua)).toBe('bot');
		}
	});

	it('treats a missing user agent as a bot — no browser omits it', () => {
		expect(deviceClass('')).toBe('bot');
	});

	it('only ever returns three values', () => {
		const seen = new Set(['iPhone', 'Macintosh', 'bingbot', ''].map(deviceClass));
		expect([...seen].every((d) => ['mobile', 'desktop', 'bot'].includes(d))).toBe(true);
	});
});

describe('referrerHost', () => {
	it('keeps the hostname only, never the full URL', () => {
		expect(referrerHost('https://news.ycombinator.com/item?id=1&utm_source=x', 'ij5.dev')).toBe(
			'news.ycombinator.com'
		);
	});

	it('strips www, so one site is one row', () => {
		expect(referrerHost('https://www.example.com/a', 'ij5.dev')).toBe('example.com');
	});

	it('reports no referrer as direct', () => {
		expect(referrerHost(null, 'ij5.dev')).toBe('direct');
	});

	it('reports self-referrals as direct', () => {
		expect(referrerHost('https://ij5.dev/gh', 'ij5.dev')).toBe('direct');
		expect(referrerHost('https://www.ij5.dev/gh', 'ij5.dev')).toBe('direct');
	});

	it('never throws on a malformed referrer', () => {
		expect(referrerHost('not a url', 'ij5.dev')).toBe('direct');
	});
});

describe('bucket404', () => {
	it('keeps a plausible path, which is what makes the 404 report actionable', () => {
		expect(bucket404('resume', 'desktop')).toBe('resume');
	});

	it('collapses a bot 404 — every dashboard query filters bots out again', () => {
		expect(bucket404('resume', 'bot')).toBe(OTHER);
	});

	it('collapses anything that could never have been a slug', () => {
		for (const junk of ['%2e%2e%2f', 'wp-admin/setup', 'a'.repeat(200), 'ünicode', '-x']) {
			expect(bucket404(junk, 'desktop')).toBe(OTHER);
		}
	});

	it('bounds the column: a kept path is at most 64 characters', () => {
		expect(bucket404('a'.repeat(64), 'mobile')).toHaveLength(64);
		expect(bucket404('a'.repeat(65), 'mobile')).toBe(OTHER);
	});
});

describe('visitorHash', () => {
	it('rotates with the day, so it is useless across days', async () => {
		const args = ['1.2.3.4', 'UA'] as const;
		const a = await visitorHash('salt', '2026-01-01', ...args);
		const b = await visitorHash('salt', '2026-01-02', ...args);
		expect(a).not.toBe(b);
	});

	it('is stable within a day, which is what makes the daily unique count work', async () => {
		const a = await visitorHash('salt', '2026-01-01', '1.2.3.4', 'UA');
		const b = await visitorHash('salt', '2026-01-01', '1.2.3.4', 'UA');
		expect(a).toBe(b);
	});

	it('depends on the salt, so the hashes are not reproducible without it', async () => {
		const a = await visitorHash('salt-a', '2026-01-01', '1.2.3.4', 'UA');
		const b = await visitorHash('salt-b', '2026-01-01', '1.2.3.4', 'UA');
		expect(a).not.toBe(b);
	});

	it('stores 8 bytes and nothing identifying', async () => {
		expect(await visitorHash('salt', '2026-01-01', '1.2.3.4', 'UA')).toMatch(/^[0-9a-f]{16}$/);
	});
});

describe('today', () => {
	it('is the YYYY-MM-DD the `day` column expects', () => {
		expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
