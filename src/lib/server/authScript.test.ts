import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyPassword } from './password';
import { parsePath } from './puzzle';

/**
 * `scripts/auth.mjs` hashes passwords on your machine and the Worker verifies
 * them, with two copies of the same code. This keeps the copies honest.
 */

const SCRIPT = fileURLToPath(new URL('../../../scripts/auth.mjs', import.meta.url));
const run = (args: string[], input = '', env: Record<string, string> = {}) =>
	execFileSync(process.execPath, [SCRIPT, ...args], { input, env: { ...process.env, ...env }, encoding: 'utf8' });

describe('scripts/auth.mjs', () => {
	it('prints a PASSWORD_HASH the Worker accepts, and escapes it for .dev.vars', () => {
		const out = run(['password'], 'tangerine sky\ntangerine sky\n', { PASSWORD_PEPPER: 'pep' });
		const [raw, escaped] = [...out.matchAll(/PASSWORD_HASH=(\S+)/g)].map((m) => m[1]);
		expect(verifyPassword('tangerine sky', raw, 'pep')).toBe(true);
		expect(verifyPassword('tangerine sky', raw, 'other')).toBe(false);
		expect(escaped).toBe(raw.replace(/\$/g, '\\$'));
	});

	it('deals a PUZZLE_PATH the Worker can read', () => {
		const path = /PUZZLE_PATH=(.+)/.exec(run(['puzzle']))![1];
		expect(parsePath(path)).toHaveLength(4);
	});
});
