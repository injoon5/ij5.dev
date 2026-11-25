/**
 * Failed-guess limits for the password doors (§4).
 *
 * Every attempt is counted against two buckets: the caller's IP (a /64 for
 * IPv6) and a global one. The IP bucket stops one machine quickly; the global
 * bucket stops a botnet, at the cost that a botnet can lock the password door
 * for everyone — including you. So the global lock is capped at an hour, and
 * passkeys never pass through here at all.
 *
 * Recovery codes have their own pair of buckets (`rc:`), so a flood against
 * the puzzle door never blocks the paper codes.
 *
 * Over a year, the global bucket lets a patient, distributed attacker make a
 * few hundred thousand guesses at most. Password + 4-digit puzzle answer
 * needs to be comfortably out of reach of that, which even a modest password
 * is.
 */

type Env = App.Platform['env'];

export type Door = 'pw' | 'rc';

type Policy = { free: number; baseMs: number; capMs: number };

const IP: Policy = { free: 5, baseMs: 60e3, capMs: 24 * 3600e3 };
const GLOBAL: Policy = { free: 20, baseMs: 5 * 60e3, capMs: 3600e3 };
/** A day without failures wipes the slate. */
const DECAY_MS = 24 * 3600e3;

/** How long to lock after the `failures`-th failure in a row. */
export function lockFor(failures: number, policy: Policy): number {
	if (failures < policy.free) return 0;
	return Math.min(policy.baseMs * 2 ** (failures - policy.free), policy.capMs);
}

const buckets = (door: Door, ip: string) =>
	[
		[`${door}:ip:${ip}`, IP],
		[`${door}:global`, GLOBAL]
	] as const;

/** The moment the door opens again for this caller, or 0 if it is open. */
export async function lockedUntil(env: Env, door: Door, ip: string, now = Date.now()): Promise<number> {
	const keys = buckets(door, ip).map(([k]) => k);
	const { results } = await env.DB.prepare(
		`SELECT locked_until FROM auth_throttle WHERE bucket IN (?, ?) AND locked_until > ?`
	)
		.bind(keys[0], keys[1], now)
		.all<{ locked_until: number }>();
	return results.reduce((max: number, r: { locked_until: number }) => Math.max(max, r.locked_until), 0);
}

/** Counts a failure. Returns the lock it caused (0 if none). */
export async function recordFailure(env: Env, door: Door, ip: string, now = Date.now()): Promise<number> {
	let until = 0;
	for (const [bucket, policy] of buckets(door, ip)) {
		const row = await env.DB.prepare(
			`INSERT INTO auth_throttle (bucket, failures, last_failure_at, locked_until)
			 VALUES (?, 1, ?, 0)
			 ON CONFLICT (bucket) DO UPDATE SET
			   failures = CASE WHEN last_failure_at < ? THEN 1 ELSE failures + 1 END,
			   last_failure_at = excluded.last_failure_at
			 RETURNING failures`
		)
			.bind(bucket, now, now - DECAY_MS)
			.first<{ failures: number }>();
		const ms = lockFor(row?.failures ?? 1, policy);
		if (ms) {
			await env.DB.prepare(`UPDATE auth_throttle SET locked_until = ? WHERE bucket = ?`)
				.bind(now + ms, bucket)
				.run();
			until = Math.max(until, now + ms);
		}
	}
	return until;
}

/** A success clears the caller's own bucket and the global one: it was you. */
export async function recordSuccess(env: Env, door: Door, ip: string) {
	const keys = buckets(door, ip).map(([k]) => k);
	await env.DB.prepare(`DELETE FROM auth_throttle WHERE bucket IN (?, ?)`).bind(keys[0], keys[1]).run();
}
