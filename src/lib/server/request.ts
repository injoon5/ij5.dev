/**
 * Who is asking, as far as rate limiting is concerned. An IPv6 client owns a
 * whole /64, so it is counted as one: limiting single v6 addresses would hand
 * every attacker 2^64 fresh tries.
 */
export function clientIp(request: Request): string {
	const ip = request.headers.get('cf-connecting-ip') ?? '';
	if (!ip.includes(':')) return ip || 'unknown';
	const groups = expandV6(ip);
	return groups ? `${groups.slice(0, 4).join(':')}::/64` : ip;
}

function expandV6(ip: string): string[] | null {
	const [head, tail] = ip.split('::');
	const a = head ? head.split(':') : [];
	const b = tail !== undefined && tail ? tail.split(':') : [];
	if (ip.includes('::')) {
		const fill = 8 - a.length - b.length;
		if (fill < 0) return null;
		return [...a, ...Array(fill).fill('0'), ...b].map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''));
	}
	return a.length === 8 ? a.map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')) : null;
}

/** Where a request came from, for the sign-in log and alerts. */
export function requestMeta(request: Request) {
	const cf = (request as Request & { cf?: { country?: string; city?: string } }).cf;
	return {
		ip: request.headers.get('cf-connecting-ip'),
		country: cf?.country ?? request.headers.get('cf-ipcountry'),
		userAgent: (request.headers.get('user-agent') ?? '').slice(0, 300) || null
	};
}
