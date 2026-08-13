import { describe, expect, it } from 'vitest';
import {
	classify,
	fingerprint,
	OTHER,
	bucket404,
	deviceClass,
	parseBeacon,
	readCookie,
	referrerHost,
	today,
	visitorHash
} from './track';

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

describe('classify', () => {
	it('reads the OS and browser out of real user agents', () => {
		expect(
			classify(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
			)
		).toEqual({ os: 'Windows', browser: 'Chrome' });

		expect(
			classify(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
			)
		).toEqual({ os: 'macOS', browser: 'Safari' });

		expect(
			classify(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
			)
		).toEqual({ os: 'iOS', browser: 'Safari' });

		expect(
			classify(
				'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36'
			)
		).toEqual({ os: 'Android', browser: 'Chrome' });

		expect(
			classify('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0')
		).toEqual({ os: 'Ubuntu', browser: 'Firefox' });
	});

	it('does not let a Chromium skin pass as Chrome', () => {
		expect(
			classify(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
			)
		).toEqual({ os: 'Windows', browser: 'Edge' });

		expect(
			classify(
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/107.0.0.0'
			)
		).toEqual({ os: 'Linux', browser: 'Opera' });
	});

	it('reports Unknown rather than guessing', () => {
		expect(classify('')).toEqual({ os: 'Unknown', browser: 'Unknown' });
		expect(classify('Googlebot/2.1')).toEqual({ os: 'Unknown', browser: 'Unknown' });
	});
});

describe('readCookie', () => {
	it('picks a named cookie out of the header', () => {
		expect(readCookie('a=1; f=abc; sid=xyz', 'f')).toBe('abc');
	});

	it('returns null when absent', () => {
		expect(readCookie('a=1; sid=xyz', 'f')).toBeNull();
		expect(readCookie(null, 'f')).toBeNull();
	});

	it('matches the name, not a prefix of a longer one', () => {
		expect(readCookie('ff=zz; f=abc', 'f')).toBe('abc');
		expect(readCookie('ff=zz', 'f')).toBeNull();
	});
});

describe('parseBeacon', () => {
	it('accepts a well-formed payload', () => {
		const sigs = parseBeacon(
			'{"b":["Chrome 122"],"p":"macOS","m":false,"t":0,"l":"en-US","z":"UTC","s":"1440x900","d":2}'
		);
		expect(sigs).not.toBeNull();
		expect(sigs!.l).toBe('en-US');
	});

	it('rejects non-objects and wrong field types', () => {
		expect(parseBeacon('nope')).toBeNull();
		expect(parseBeacon('[]')).toBeNull();
		expect(parseBeacon('{"b":["ok", 3]}')).toBeNull();
		expect(parseBeacon('{"d":"high"}')).toBeNull();
	});
});

describe('fingerprint', () => {
	it('is stable for the same device', async () => {
		const sigs = { p: 'macOS', l: 'en-US', z: 'UTC', s: '1440x900', d: 2 };
		expect(await fingerprint('salt', sigs, 'UA')).toBe(await fingerprint('salt', sigs, 'UA'));
	});

	it('depends on the salt and the signals', async () => {
		const a = await fingerprint('salt-a', { p: 'macOS' }, 'UA');
		const b = await fingerprint('salt-b', { p: 'macOS' }, 'UA');
		const c = await fingerprint('salt-a', { p: 'Linux' }, 'UA');
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
	});

	it('stores 16 bytes — enough to be unique in practice', async () => {
		expect(await fingerprint('salt', {}, 'UA')).toMatch(/^[0-9a-f]{32}$/);
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
