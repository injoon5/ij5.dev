#!/usr/bin/env node
/**
 * Generates the secrets for signing in (§4). Prints values; stores nothing.
 *
 *   node scripts/auth.mjs password      PASSWORD_HASH (+ PASSWORD_PEPPER if not given)
 *   node scripts/auth.mjs puzzle [path] PUZZLE_PATH — checks yours, or deals a random one
 *   node scripts/auth.mjs oidc-key      OIDC_PRIVATE_JWK (RS256)
 *   node scripts/auth.mjs oidc-client   the Access client secret and OIDC_CLIENT_SECRET_HASH
 *
 * Put each value in with `npx wrangler secret put NAME` (and in `.dev.vars` for
 * local dev). The password and the client secret themselves are never stored.
 *
 * Keep the hashing here identical to `src/lib/auth/password.server.ts`.
 */
import { argon2id } from '@noble/hashes/argon2.js';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createInterface } from 'node:readline';
import { exportJWK, generateKeyPair } from 'jose';

const b64 = (b) => Buffer.from(b).toString('base64');
const nopad = (s) => s.replace(/=+$/, '');

let rl = null;
let lines = null;
let hiding = false;

/**
 * One readline for every question, read as a line iterator, so piped input
 * is buffered rather than lost between questions. A hidden answer is not
 * echoed while it is typed.
 */
async function ask(question, { hidden = false } = {}) {
	if (!rl) {
		rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
		const write = rl._writeToOutput.bind(rl);
		rl._writeToOutput = (s) => (hiding ? undefined : write(s));
		lines = rl[Symbol.asyncIterator]();
	}
	process.stdout.write(question);
	hiding = hidden;
	const { value = '' } = await lines.next();
	hiding = false;
	if (hidden && process.stdin.isTTY) process.stdout.write('\n');
	return value;
}

const CELLS = /^[A-D][1-4]$/;

const commands = {
	async password() {
		const password = await ask('Password: ', { hidden: true });
		if (password.length < 8) throw new Error('Use at least 8 characters — the puzzle is a second factor, not a substitute.');
		if ((await ask('Again: ', { hidden: true })) !== password) throw new Error('They did not match.');

		const pepper = process.env.PASSWORD_PEPPER || b64(randomBytes(32));
		const salt = randomBytes(16);
		const m = 19456;
		const t = 2;
		const hash = argon2id(new TextEncoder().encode(password.normalize('NFKC')), salt, {
			m,
			t,
			p: 1,
			key: new TextEncoder().encode(pepper),
			dkLen: 32
		});

		const phc = `$argon2id$v=19$m=${m},t=${t},p=1$${nopad(b64(salt))}$${nopad(b64(hash))}`;

		console.log('\nFor `npx wrangler secret put` (the value after the =):');
		if (!process.env.PASSWORD_PEPPER) console.log(`  PASSWORD_PEPPER=${pepper}`);
		console.log(`  PASSWORD_HASH=${phc}`);
		if (process.env.PASSWORD_PEPPER) console.log('  (hashed with the PASSWORD_PEPPER from your environment)');
		// Wrangler expands `$NAME` in `.dev.vars`, which would eat the hash.
		console.log('\nFor .dev.vars, with every $ escaped (wrangler expands $NAME there):');
		console.log(`  PASSWORD_HASH=${phc.replace(/\$/g, '\\$')}`);
	},

	async puzzle(...args) {
		let path = args.join(' ').trim().toUpperCase();
		if (!path) {
			// Four distinct cells, in a random order.
			const all = [];
			for (const r of '1234') for (const c of 'ABCD') all.push(c + r);
			const picked = [];
			while (picked.length < 4) {
				const cell = all.splice(randomInt(all.length), 1)[0];
				picked.push(cell);
			}
			path = picked.join(' ');
		}
		const cells = path.split(/[\s,;>-]+/).filter(Boolean);
		if (cells.length < 4 || cells.length > 8 || !cells.every((c) => CELLS.test(c))) {
			throw new Error('A route is 4 to 8 cells like "A1 B2 C3 C4" (columns A–D, rows 1–4).');
		}
		console.log(`PUZZLE_PATH=${cells.join(' ')}`);
		console.log('Remember the route, not the digits: the digits change every time.');
	},

	async ['oidc-key']() {
		const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
		const jwk = await exportJWK(privateKey);
		jwk.kid = `ij5-${new Date().toISOString().slice(0, 10)}`;
		jwk.alg = 'RS256';
		jwk.use = 'sig';
		console.log(`OIDC_PRIVATE_JWK=${JSON.stringify(jwk)}`);
	},

	async ['oidc-client']() {
		const secret = randomBytes(32).toString('base64url');
		console.log(`Client secret (paste into Cloudflare Access, nowhere else): ${secret}`);
		console.log(`OIDC_CLIENT_SECRET_HASH=${createHash('sha256').update(secret).digest('base64')}`);
	}
};

const [cmd, ...rest] = process.argv.slice(2);
if (!commands[cmd]) {
	console.error('Usage: node scripts/auth.mjs <password | puzzle [route] | oidc-key | oidc-client>');
	process.exit(1);
}
try {
	await commands[cmd](...rest);
	rl?.close();
} catch (e) {
	console.error(e.message);
	process.exit(1);
}
