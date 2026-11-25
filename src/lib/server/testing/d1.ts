import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sha256 } from '$lib/server/crypto';

/**
 * A D1 stand-in backed by real SQLite (`node:sqlite`), for tests only — the
 * same trick the `hits` and passkey suites use, so the SQL that ships is the
 * SQL that passes. It also covers `batch()`, as one transaction that rolls
 * back on the first error, which is the D1 behaviour the Shelf routes lean on
 * for atomic writes and for consuming an install key exactly once.
 */

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Value = SQLInputValue;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../migrations/', import.meta.url));

/** Every migration, in order: the schema is their sum. */
export function migratedDb(): DatabaseSync {
	const db = new DatabaseSync(':memory:');
	for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
		db.exec(readFileSync(MIGRATIONS_DIR + file, 'utf8'));
	}
	return db;
}

const returnsRows = (sql: string) => /^\s*(SELECT|WITH)\b|\bRETURNING\b/i.test(sql);
const plain = <T>(row: unknown) => (row ? ({ ...(row as object) } as T) : null);

export function d1(db: DatabaseSync) {
	const statement = (sql: string) => {
		let bound: Value[] = [];
		// D1 binds `?1`/`?2` by position; node:sqlite (Node 22) reads them as
		// names and refuses a positional spread.
		const args = (): Value[] | [Record<string, Value>] =>
			/\?\d/.test(sql) ? [Object.fromEntries(bound.map((v, i) => [`?${i + 1}`, v]))] : bound;
		const exec = () => {
			const stmt = db.prepare(sql);
			if (returnsRows(sql)) {
				const results = stmt.all(...(args() as Value[])).map((r) => plain<Record<string, unknown>>(r)!);
				return { success: true, results, meta: { changes: /^\s*(SELECT|WITH)\b/i.test(sql) ? 0 : results.length } };
			}
			const r = stmt.run(...(args() as Value[]));
			return { success: true, results: [], meta: { changes: Number(r.changes) } };
		};
		const self = {
			bind: (...args: unknown[]) => {
				bound = args.map((a) => (a === undefined ? null : a)) as Value[];
				return self;
			},
			all: async () => exec(),
			run: async () => exec(),
			first: async <T>() => plain<T>(db.prepare(sql).get(...(args() as Value[]))),
			exec
		};
		return self;
	};

	return {
		prepare: statement,
		async batch(stmts: Array<ReturnType<typeof statement>>) {
			db.exec('BEGIN');
			try {
				const out = stmts.map((s) => s.exec());
				db.exec('COMMIT');
				return out;
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
		}
	};
}

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

export async function testEnv(db = migratedDb()) {
	return {
		db,
		env: { DB: d1(db), AUTH_HASH: await sha256(ADMIN_TOKEN) } as unknown as App.Platform['env']
	};
}

/** Calls a SvelteKit request handler the way the adapter would. */
export function call(
	handler: (event: never) => Response | Promise<Response>,
	env: App.Platform['env'],
	opts: {
		method?: string;
		path: string;
		params?: Record<string, string>;
		token?: string | null;
		body?: string;
		type?: string;
		headers?: Record<string, string>;
	}
): Promise<Response> {
	const headers = new Headers(opts.headers);
	const token = opts.token === undefined ? ADMIN_TOKEN : opts.token;
	if (token) headers.set('authorization', `Bearer ${token}`);
	if (opts.body !== undefined) headers.set('content-type', opts.type ?? 'application/json');
	const request = new Request(`http://localhost${opts.path}`, {
		method: opts.method ?? 'GET',
		headers,
		body: opts.body
	});
	return Promise.resolve(
		handler({
			request,
			url: new URL(request.url),
			params: opts.params ?? {},
			platform: { env }
		} as never)
	);
}
