import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_UPSERT, HITS_UPSERT, MIGRATE_VISITOR, PURGE_VISITOR, VISITORS_INSERT } from './track.server';
import { dashboard } from './stats.server';
import { utcDay } from './ranges';
import { HOME_SLUG, OTHER_PATH } from './visit';
import { d1, migratedDb, sqlite } from '$lib/server/testing/d1';

/**
 * The analytics write statements and the dashboard's read queries, run
 * against an in-memory SQLite built from every migration — the SQL that ships
 * is the SQL that passes.
 */

const withSqlite = sqlite ? describe : describe.skip;

withSqlite('hits', () => {
	let db: import('node:sqlite').DatabaseSync;

	const HIT = ['2026-01-01', 'gh', 'redirect', 'KR', 'direct', 'mobile'] as const;

	beforeEach(() => {
		db = migratedDb();
	});

	const hit = (...args: readonly string[]) => db.prepare(HITS_UPSERT).run(...args);
	const rows = <T>(sql: string, ...args: unknown[]) =>
		db.prepare(sql).all(...(args as never[])) as T[];

	// D1 binds `?1`/`?2` positionally. node:sqlite on Node 22 treats them as
	// named (`{"?1": v}`) and throws "column index out of range" on a spread.
	const runN = (sql: string, ...args: import('node:sqlite').SQLInputValue[]) => {
		const named: Record<string, import('node:sqlite').SQLInputValue> = {};
		args.forEach((v, i) => {
			named[`?${i + 1}`] = v;
		});
		return db.prepare(sql).run(named);
	};

	it('creates the two indexes that keep per-slug queries off a full scan', () => {
		const indexes = rows<{ name: string }>(
			`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`
		).map((r) => r.name);

		expect(indexes).toContain('hits_slug');
		expect(indexes).toContain('visitors_slug');
	});

	it('increments rather than duplicating', () => {
		hit(...HIT);
		hit(...HIT);
		hit(...HIT);

		expect(rows<{ n: number }>(`SELECT n FROM hits`)).toEqual([{ n: 3 }]);
	});

	it('tracks the OS/browser breakdown in its own table, keyed off the same day/slug/kind', () => {
		const device = db.prepare(DEVICE_UPSERT);
		device.run('2026-01-01', 'gh', 'redirect', 'Windows', 'Chrome');
		device.run('2026-01-01', 'gh', 'redirect', 'Windows', 'Chrome');
		device.run('2026-01-01', 'gh', 'redirect', 'macOS', 'Safari');
		device.run('2026-01-01', 'cv', 'redirect', 'Windows', 'Chrome');

		expect(rows<{ n: number }>(`SELECT SUM(n) AS n FROM hits_device`)[0].n).toBe(4);
		expect(rows<{ n: number }>(`SELECT COUNT(*) AS n FROM hits_device`)[0].n).toBe(3);
	});

	it('folds a cookie-less identity into the fingerprint identity for the whole day', () => {
		// The visitor hit two slugs before the beacon ran; both rows share the
		// cookie-less hash. The migration moves every row for the day at once,
		// so the per-slug uniques do not double count after the beacon fires.
		db.prepare(VISITORS_INSERT).run('2026-01-01', 'gh', 'old');
		db.prepare(VISITORS_INSERT).run('2026-01-01', 'cv', 'old');

		runN(MIGRATE_VISITOR, '2026-01-01', 'new', 'old');

		expect(rows<{ vh: string; slug: string }>(`SELECT vh, slug FROM visitors ORDER BY slug`)).toEqual([
			{ vh: 'new', slug: 'cv' },
			{ vh: 'new', slug: 'gh' }
		]);
	});

	it('folds without aborting when the fingerprint row already exists', () => {
		// The page's own deferred write can land after the beacon, leaving a row
		// under the fingerprint identity on a slug the cookie-less identity also
		// hit. A plain UPDATE onto that primary key would throw and abort the
		// batch; `OR IGNORE` skips it and the purge clears the leftover, so the
		// slug ends up counted exactly once.
		db.prepare(VISITORS_INSERT).run('2026-01-01', 'gh', 'old');
		db.prepare(VISITORS_INSERT).run('2026-01-01', 'gh', 'new'); // already present

		expect(() => runN(MIGRATE_VISITOR, '2026-01-01', 'new', 'old')).not.toThrow();
		runN(PURGE_VISITOR, '2026-01-01', 'old');

		expect(rows<{ vh: string; slug: string }>(`SELECT vh, slug FROM visitors`)).toEqual([
			{ vh: 'new', slug: 'gh' }
		]);
	});

	it('leaves the next day untouched when it migrates an identity', () => {
		db.prepare(VISITORS_INSERT).run('2026-01-01', 'gh', 'old');
		db.prepare(VISITORS_INSERT).run('2026-01-02', 'gh', 'old');

		runN(MIGRATE_VISITOR, '2026-01-01', 'new', 'old');

		const rows = db
			.prepare(`SELECT vh FROM visitors WHERE day = '2026-01-02'`)
			.all() as unknown as Array<{ vh: string }>;
		expect(rows).toEqual([{ vh: 'old' }]);
	});

	it('starts a new row when any single dimension differs', () => {
		hit(...HIT);
		hit('2026-01-02', 'gh', 'redirect', 'KR', 'direct', 'mobile'); // day
		hit('2026-01-01', 'cv', 'redirect', 'KR', 'direct', 'mobile'); // slug
		hit('2026-01-01', 'gh', '404', 'KR', 'direct', 'mobile'); // kind
		hit('2026-01-01', 'gh', 'redirect', 'US', 'direct', 'mobile'); // country
		hit('2026-01-01', 'gh', 'redirect', 'KR', 'example.com', 'mobile'); // referrer
		hit('2026-01-01', 'gh', 'redirect', 'KR', 'direct', 'desktop'); // device

		const [{ rows: distinct, total }] = rows<{ rows: number; total: number }>(
			`SELECT COUNT(*) AS rows, SUM(n) AS total FROM hits`
		);

		expect(distinct).toBe(7);
		expect(total).toBe(7);
	});

	it('deduplicates a visitor within a day and separates them across days', () => {
		const visitor = db.prepare(VISITORS_INSERT);
		visitor.run('2026-01-01', 'gh', 'abc123');
		visitor.run('2026-01-01', 'gh', 'abc123');
		visitor.run('2026-01-01', 'cv', 'abc123');
		visitor.run('2026-01-02', 'gh', 'abc123');

		expect(rows<{ n: number }>(`SELECT COUNT(*) AS n FROM visitors`)[0].n).toBe(3);
		expect(rows<{ n: number }>(`SELECT COUNT(*) AS n FROM visitors WHERE slug = 'gh'`)[0].n).toBe(2);
	});

	describe('the dashboard', () => {
		const today = utcDay();
		const env = () => ({ DB: d1(db) }) as unknown as App.Platform['env'];

		it('counts the homepage as a view and a redirect as a click, and leaves bots out of both', async () => {
			hit(today, HOME_SLUG, 'home', 'KR', 'direct', 'mobile');
			hit(today, HOME_SLUG, 'home', 'KR', 'direct', 'mobile');
			hit(today, 'gh', 'redirect', 'KR', 'direct', 'desktop');
			hit(today, 'gh', 'redirect', 'KR', 'direct', 'bot');

			const d = await dashboard(env(), '7d', null);
			expect(d.totals).toMatchObject({ clicks: 1, views: 2 });
			expect(d.top).toEqual([
				{ slug: HOME_SLUG, kind: 'home', hits: 2 },
				{ slug: 'gh', kind: 'redirect', hits: 1 }
			]);
		});

		it('narrows every number to one path', async () => {
			hit(today, HOME_SLUG, 'home', 'KR', 'direct', 'mobile');
			hit(today, 'gh', 'redirect', 'US', 'example.com', 'desktop');
			db.prepare(VISITORS_INSERT).run(today, 'gh', 'v1');
			db.prepare(VISITORS_INSERT).run(today, HOME_SLUG, 'v2');

			const d = await dashboard(env(), '7d', 'gh');
			expect(d.totals).toEqual({ clicks: 1, views: 0, visitors: 1 });
			expect(d.referrers).toEqual([{ referrer: 'example.com', hits: 1 }]);
			expect(d.notFound).toEqual([]);
		});

		it('lists 404s asked for more than once, never the catch-all bucket or a bot', async () => {
			hit(today, 'resume', '404', 'KR', 'direct', 'desktop');
			hit(today, 'resume', '404', 'US', 'direct', 'mobile');
			hit(today, 'oneoff', '404', 'US', 'direct', 'mobile');
			hit(today, OTHER_PATH, '404', 'US', 'direct', 'mobile');
			hit(today, OTHER_PATH, '404', 'US', 'direct', 'mobile');
			hit(today, 'scan', '404', 'US', 'direct', 'bot');
			hit(today, 'scan', '404', 'US', 'direct', 'bot');

			expect((await dashboard(env(), '7d', null)).notFound).toEqual([{ path: 'resume', hits: 2 }]);
		});

		it('leaves days outside the range out', async () => {
			hit('2001-01-01', 'gh', 'redirect', 'KR', 'direct', 'desktop');
			expect((await dashboard(env(), '7d', null)).totals.clicks).toBe(0);
		});
	});
});
