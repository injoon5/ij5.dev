import { describe, expect, it } from 'vitest';
import { beginAuthentication, deletePasskey, finishAuthentication, getPasskey, listPasskeys } from './webauthn.server';
import { migratedDb, testEnv } from '$lib/server/testing/d1';

/**
 * The parts of passkey sign-in a test can reach without a browser: the D1
 * round trip, and the challenge rules — a challenge works once, and only for
 * what it was issued for. The signature itself is verified by
 * @simplewebauthn and exercised by a real authenticator.
 */

const ROW = {
	id: 'KtWQ8wMHTNkR9gAqL3bZxQ',
	name: 'MacBook Touch ID',
	public_key: 'pQECAyYgASFYIBQZx2kq0Mh9L8J3vUoD1sRTzP5W6lE7nB4mNcVgA2',
	counter: 7,
	transports: '["internal"]',
	created_at: 1720000000000
};

async function setup() {
	const { env, db } = await testEnv(migratedDb());
	const kv = new Map<string, string>();
	Object.assign(env, {
		KV: {
			get: async (k: string) => kv.get(k) ?? null,
			put: async (k: string, v: string) => void kv.set(k, v),
			delete: async (k: string) => void kv.delete(k)
		}
	});
	return { env, db, kv };
}

/** An assertion carrying `challenge`, as a browser would send it (unsigned: it never gets that far). */
const assertion = (challenge: string) =>
	({
		id: ROW.id,
		rawId: ROW.id,
		type: 'public-key',
		clientExtensionResults: {},
		response: {
			clientDataJSON: Buffer.from(
				JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://ij5.dev' })
			).toString('base64url'),
			authenticatorData: '',
			signature: ''
		}
	}) as never;

describe('passkey storage', () => {
	it('lists, reads and deletes a stored credential', async () => {
		const { env, db } = await setup();
		expect(await listPasskeys(env)).toHaveLength(0);

		db.prepare(
			`INSERT INTO passkeys (id, name, public_key, counter, transports, created_at, last_used_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		).run(ROW.id, ROW.name, ROW.public_key, ROW.counter, ROW.transports, ROW.created_at, null);

		expect(await listPasskeys(env)).toMatchObject([{ id: ROW.id, name: ROW.name, counter: ROW.counter }]);
		expect(await getPasskey(env, ROW.id)).toMatchObject({ id: ROW.id, public_key: ROW.public_key });
		expect(await getPasskey(env, 'missing')).toBeNull();

		await deletePasskey(env, ROW.id);
		expect(await listPasskeys(env)).toHaveLength(0);
	});
});

describe('challenges', () => {
	const CHALLENGE_REFUSED = /unknown, expired or reused/;

	it('refuses an assertion for a challenge this server never issued', async () => {
		const { env } = await setup();
		await expect(finishAuthentication(env, assertion('made-up'), 'ij5.dev', 'https://ij5.dev')).rejects.toThrow(
			CHALLENGE_REFUSED
		);
	});

	it('spends a challenge on first use, so a replayed assertion is refused', async () => {
		const { env, kv } = await setup();
		const { challenge } = await beginAuthentication(env, 'ij5.dev');
		// The first attempt fails its signature check, but it has spent the challenge.
		await expect(finishAuthentication(env, assertion(challenge), 'ij5.dev', 'https://ij5.dev')).rejects.toThrow();
		expect([...kv.keys()]).toEqual([]);
		await expect(finishAuthentication(env, assertion(challenge), 'ij5.dev', 'https://ij5.dev')).rejects.toThrow(
			CHALLENGE_REFUSED
		);
	});

	it('refuses a registration challenge used to sign in', async () => {
		const { env, kv } = await setup();
		kv.set('passkey:challenge:reg', 'register');
		await expect(finishAuthentication(env, assertion('reg'), 'ij5.dev', 'https://ij5.dev')).rejects.toThrow(
			CHALLENGE_REFUSED
		);
	});
});
