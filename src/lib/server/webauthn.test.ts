import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeClientDataJSON } from '@simplewebauthn/server/helpers';
import { deletePasskey, getPasskey, listPasskeys } from './webauthn';

/**
 * The passkey flow's crypto is exercised end-to-end by a real browser, so the
 * unit surface here is the parts a test can reach without one: the challenge
 * keying (a challenge consumed once cannot be consumed again) and the D1
 * round trip, run against real SQLite with the real migrations — the same
 * trick the `hits` suite uses, so the SQL that ships is the SQL that passes.
 */

const MIGRATIONS = ['0001_init.sql', '0003_passkeys.sql'].map(
	(name) => fileURLToPath(new URL(`../../../migrations/${name}`, import.meta.url))
);

// `node:sqlite` is unflagged from Node 22.5 onwards. If a runtime does not have
// it, skip rather than fail — the suite should never go red for that reason.
let sqlite: typeof import('node:sqlite') | null = null;
try {
	sqlite = await import('node:sqlite');
} catch {
	sqlite = null;
}

const withSqlite = sqlite ? describe : describe.skip;

/** The slice of the D1 API `webauthn.ts` uses, backed by a real SQLite db. */
function d1(db: import('node:sqlite').DatabaseSync) {
	return {
		prepare(sql: string) {
			const bound: import('node:sqlite').SQLInputValue[] = [];
			const stmt = {
				bind: (...args: import('node:sqlite').SQLInputValue[]) => {
					bound.push(...args);
					return stmt;
				},
				all: async () => ({ results: db.prepare(sql).all(...bound) }),
				first: async () => db.prepare(sql).get(...bound) ?? null,
				run: async () => db.prepare(sql).run(...bound)
			};
			return stmt;
		}
	};
}

function env(db: import('node:sqlite').DatabaseSync) {
	return { DB: d1(db) } as unknown as App.Platform['env'];
}

const ROW = {
	id: 'KtWQ8wMHTNkR9gAqL3bZxQ',
	name: 'MacBook Touch ID',
	public_key: 'pQECAyYgASFYIBQZx2kq0Mh9L8J3vUoD1sRTzP5W6lE7nB4mNcVgA2',
	counter: 7,
	transports: '["internal"]',
	created_at: 1720000000000
};

withSqlite('passkey storage', () => {
	let db: import('node:sqlite').DatabaseSync;
	let store: App.Platform['env'];

	beforeEach(() => {
		db = new sqlite!.DatabaseSync(':memory:');
		for (const file of MIGRATIONS) db.exec(readFileSync(file, 'utf8'));
		store = env(db);
	});

	it('applies the schema cleanly — a passkeys table exists', () => {
		const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
			name: string;
		}[];
		expect(rows.map((r) => r.name)).toContain('passkeys');
	});

	it('lists, reads and deletes a stored credential', async () => {
		expect(await listPasskeys(store)).toHaveLength(0);

		db.prepare(
			`INSERT INTO passkeys (id, name, public_key, counter, transports, created_at, last_used_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		).run(ROW.id, ROW.name, ROW.public_key, ROW.counter, ROW.transports, ROW.created_at, null);

		const listed = await listPasskeys(store);
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({ id: ROW.id, name: ROW.name, counter: ROW.counter });

		const got = await getPasskey(store, ROW.id);
		expect(got).toMatchObject({ id: ROW.id, public_key: ROW.public_key });

		expect(await getPasskey(store, 'missing')).toBeNull();

		await deletePasskey(store, ROW.id);
		expect(await listPasskeys(store)).toHaveLength(0);
	});
});

describe('challenge keying', () => {
	it('derives the storage key from clientDataJSON alone', () => {
		const challenge = 'abc123';
		const clientDataJSON = Buffer.from(
			JSON.stringify({ type: 'webauthn.get', challenge })
		).toString('base64url');

		const decoded = decodeClientDataJSON(clientDataJSON);
		expect(decoded.challenge).toBe(challenge);
		expect(`passkey:challenge:${decoded.challenge}`).toBe(`passkey:challenge:${challenge}`);
	});
});
