/**
 * What a user-agent string says, for analytics and the sign-in log. Done on
 * the server, so it covers redirect clicks too — no JavaScript needed.
 */

const BOT =
	/bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|pinterest|vkshare|whatsapp|telegram|discord|slackbot|preview|headless|monitor|curl|wget|python-requests|axios|node-fetch/i;

const MOBILE = /android|iphone|ipod|ipad|iemobile|opera mini|mobile safari|windows phone/i;

export function deviceClass(ua: string): 'mobile' | 'desktop' | 'bot' {
	if (!ua || BOT.test(ua)) return 'bot';
	return MOBILE.test(ua) ? 'mobile' : 'desktop';
}

const UNKNOWN = 'Unknown';

function detectOS(ua: string): string {
	if (/Windows/.test(ua)) return 'Windows';
	if (/Android/.test(ua)) return 'Android';
	// iPads report `Mac OS X` too, so the check has to come first.
	if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
	if (/CrOS/.test(ua)) return 'Chrome OS';
	if (/Mac OS X/.test(ua)) return 'macOS';
	if (/Ubuntu/.test(ua)) return 'Ubuntu';
	if (/Fedora/.test(ua)) return 'Fedora';
	if (/Debian/.test(ua)) return 'Debian';
	if (/Arch Linux/.test(ua)) return 'Arch Linux';
	if (/Linux/.test(ua)) return 'Linux';
	return UNKNOWN;
}

function detectBrowser(ua: string): string {
	// Every check that would otherwise match `Chrome/` comes first.
	if (/Edg(e|A|iOS)?\/|Edge\//.test(ua)) return 'Edge';
	if (/OPR\/|Opera/.test(ua)) return 'Opera';
	if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
	if (/Brave/.test(ua)) return 'Brave';
	if (/CriOS\//.test(ua)) return 'Chrome';
	if (/FxiOS\//.test(ua)) return 'Firefox';
	if (/Firefox\//.test(ua)) return 'Firefox';
	if (/Chrome\//.test(ua)) return 'Chrome';
	if (/MicroMessenger/.test(ua)) return 'WeChat';
	if (/Safari\//.test(ua)) return 'Safari';
	return UNKNOWN;
}

export function classify(ua: string): { os: string; browser: string } {
	return { os: detectOS(ua), browser: detectBrowser(ua) };
}

/** "Chrome on Windows" — enough to recognise a device in a list. */
export function describe(ua: string | null): string {
	if (!ua) return 'Unknown browser';
	const { os, browser } = classify(ua);
	return `${browser === UNKNOWN ? 'Browser' : browser} on ${os === UNKNOWN ? 'unknown OS' : os}`;
}
