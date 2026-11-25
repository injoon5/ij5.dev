import { describe, expect, it } from 'vitest';
import { createSession, deleteOtherSessions, deleteSession, listSessions, readSession } from './sessions.server';
import { migratedDb, sqlite, testEnv } from '$lib/server/testing/d1';

const meta = { ip: '203.0.113.7', country: 'KR', userAgent: 'test' };

(sqlite ? describe : describe.skip)('sessions', () => {
	it('stores only a hash of the cookie token', async () => {
		const { env, db } = await testEnv(migratedDb());
		const { token, row } = await createSession(env, 'full', 'passkey', meta);
		const stored = db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
		expect(stored).toEqual([{ id: row.id }]);
		expect(row.id).not.toBe(token);
		expect((await readSession(env, token))?.id).toBe(row.id);
	});

	it('gives a limited session one hour and a full one thirty days', async () => {
		const { env } = await testEnv(migratedDb());
		const now = 1_800_000_000_000;
		const limited = await createSession(env, 'limited', 'password', meta, now);
		const full = await createSession(env, 'full', 'passkey', meta, now);
		expect(await readSession(env, limited.token, undefined, now + 59 * 60e3)).not.toBeNull();
		expect(await readSession(env, limited.token, undefined, now + 61 * 60e3)).toBeNull();
		expect(await readSession(env, full.token, undefined, now + 29 * 864e5)).not.toBeNull();
		expect(await readSession(env, full.token, undefined, now + 31 * 864e5)).toBeNull();
	});

	it('refuses unknown, missing and oversized tokens', async () => {
		const { env } = await testEnv(migratedDb());
		for (const t of [undefined, '', 'nope', 'x'.repeat(500)]) expect(await readSession(env, t)).toBeNull();
	});

	it('revokes one, or every other', async () => {
		const { env } = await testEnv(migratedDb());
		const a = await createSession(env, 'full', 'passkey', meta);
		const b = await createSession(env, 'full', 'token', meta);
		const c = await createSession(env, 'limited', 'password', meta);
		await deleteSession(env, b.row.id);
		expect(await readSession(env, b.token)).toBeNull();
		expect(await deleteOtherSessions(env, a.row.id)).toBe(1);
		expect(await readSession(env, c.token)).toBeNull();
		expect((await listSessions(env)).map((s) => s.id)).toEqual([a.row.id]);
	});

	it('refreshes last-seen only when it is stale, through the given hook', async () => {
		const { env } = await testEnv(migratedDb());
		const now = 1_800_000_000_000;
		const { token } = await createSession(env, 'full', 'passkey', meta, now);
		const writes: Promise<unknown>[] = [];
		await readSession(env, token, (p) => writes.push(p), now + 60e3);
		expect(writes).toHaveLength(0);
		await readSession(env, token, (p) => writes.push(p), now + 10 * 60e3);
		expect(writes).toHaveLength(1);
	});
});
