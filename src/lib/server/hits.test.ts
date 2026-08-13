import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_UPSERT, HITS_UPSERT, MIGRATE_VISITOR, VISITORS_INSERT } from './track';

/**
 * §13, test 3 — the `hits` upsert increments rather than duplicating.
 *
 * D1 is SQLite, so the real migration and the real statements run here against
 * an in-memory database. That makes this a test of the schema as much as the
 * write path: a primary key that stopped covering every dimension, or an index
 * that stopped existing, fails right here.
 */

// The schema is the sum of every migration, so the suite applies all of them
// in order rather than pinning one file. A test that stops at 0001 would keep
// asserting a `blocks` table long after it was retired.
const MIGRATIONS = [
	'0001_init.sql',
	'0002_markdown.sql',
	'0003_passkeys.sql',
	'0004_cleanup.sql',
	'0005_fingerprint.sql'
].map((name) => fileURLToPath(new URL(`../../../migrations/${name}`, import.meta.url)));

// `node:sqlite` is unflagged from Node 22.5 onwards. If a runtime does not have
// it, skip rather than fail — the suite should never go red for that reason.
let sqlite: typeof import('node:sqlite') | null = null;
try {
	sqlite = await import('node:sqlite');
} catch {
	sqlite = null;
}

const withSqlite = sqlite ? describe : describe.skip;

withSqlite('hits', () => {
	let db: import('node:sqlite').DatabaseSync;

	const HIT = ['2026-01-01', 'gh', 'redirect', 'KR', 'direct', 'mobile'] as const;

	beforeEach(() => {
		db = new sqlite!.DatabaseSync(':memory:');
		for (const file of MIGRATIONS) db.exec(readFileSync(file, 'utf8'));
	});

	const hit = (...args: readonly string[]) => db.prepare(HITS_UPSERT).run(...args);
	const rows = <T>(sql: string, ...args: unknown[]) =>
		db.prepare(sql).all(...(args as never[])) as T[];

	it('applies the migration cleanly', () => {
		const tables = rows<{ name: string }>(
			`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
		).map((r) => r.name);

		// `blocks` was retired by 0004; `passkeys` arrived with 0003. Everything
		// else is 0001's original shape, plus `hits_device` from 0005.
		expect(tables).toEqual(['assets', 'hits', 'hits_device', 'passkeys', 'profile', 'slugs', 'visitors']);
	});

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

		db.prepare(MIGRATE_VISITOR).run('2026-01-01', 'new', 'old');

		expect(rows<{ vh: string; slug: string }>(`SELECT vh, slug FROM visitors ORDER BY slug`)).toEqual([
			{ vh: 'new', slug: 'cv' },
			{ vh: 'new', slug: 'gh' }
		]);
	});

	it('leaves the next day untouched when it migrates an identity', () => {
		db.prepare(VISITORS_INSERT).run('2026-01-01', 'gh', 'old');
		db.prepare(VISITORS_INSERT).run('2026-01-02', 'gh', 'old');

		db.prepare(MIGRATE_VISITOR).run('2026-01-01', 'new', 'old');

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

	it('counts the homepage under the empty slug, alongside redirects', () => {
		hit('2026-01-01', '', 'home', 'KR', 'direct', 'mobile');
		hit('2026-01-01', '', 'home', 'KR', 'direct', 'mobile');
		hit(...HIT);

		const [totals] = rows<{ redirects: number; home: number }>(
			`SELECT
			   SUM(CASE WHEN kind = 'redirect' THEN n ELSE 0 END) AS redirects,
			   SUM(CASE WHEN kind = 'home' THEN n ELSE 0 END) AS home
			 FROM hits WHERE device != 'bot'`
		);

		expect(totals).toEqual({ redirects: 1, home: 2 });
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

	it('reports hits and uniques from the same population', () => {
		// The dashboard's top-slugs query joins a bot-filtered hits total to an
		// unfiltered visitors count. That only reads correctly because bot rows
		// never reach `visitors` in the first place — `track` skips them.
		hit(...HIT);
		hit('2026-01-01', 'gh', 'redirect', 'KR', 'direct', 'bot');
		db.prepare(VISITORS_INSERT).run('2026-01-01', 'gh', 'human');

		const [row] = rows<{ slug: string; hits: number; visitors: number }>(
			`WITH v AS (SELECT slug, COUNT(*) AS visitors FROM visitors GROUP BY slug)
			 SELECT h.slug, SUM(h.n) AS hits, COALESCE(v.visitors, 0) AS visitors
			 FROM hits h LEFT JOIN v ON v.slug = h.slug
			 WHERE h.device != 'bot' AND h.kind = 'redirect'
			 GROUP BY h.slug`
		);

		expect(row).toEqual({ slug: 'gh', hits: 1, visitors: 1 });
	});

	it('surfaces 404s worth turning into real slugs, and nothing a bot invented', () => {
		hit('2026-01-01', 'resume', '404', 'KR', 'direct', 'desktop');
		hit('2026-01-01', 'resume', '404', 'US', 'direct', 'mobile');
		hit('2026-01-01', '*', '404', 'US', 'direct', 'bot');
		hit('2026-01-01', 'oneoff', '404', 'US', 'direct', 'mobile');

		const found = rows<{ path: string; hits: number }>(
			`SELECT slug AS path, SUM(n) AS hits FROM hits
			 WHERE kind = '404' AND device != 'bot'
			 GROUP BY path HAVING SUM(n) > 1 ORDER BY hits DESC LIMIT 5`
		);

		// A one-off 404 is a single typo, not a path worth creating.
		expect(found).toEqual([{ path: 'resume', hits: 2 }]);
	});

	it('holds one row per profile, and only row 1', () => {
		expect(rows<{ n: number }>(`SELECT COUNT(*) AS n FROM profile`)[0].n).toBe(1);
		expect(() => db.prepare(`INSERT INTO profile (id, name) VALUES (2, 'x')`).run()).toThrow();
	});
});
