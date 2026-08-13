/*
 * The fingerprint beacon — the only network request the home page makes
 * besides its own assets, and only when JS runs at all. One tiny deferred
 * POST, keepalive so it survives a mid-flight navigation, and it blocks
 * nothing: it is `defer` in the page and `keepalive` on the wire.
 *
 * The signals it collects are stable per device — browser + platform from
 * UA-CH, language, timezone, screen, touch — and are hashed on the server
 * into a fingerprint that rotates out of the stored data every day. The raw
 * signals themselves are never stored and never leave the request.
 *
 * A static file rather than an inline script so `script-src 'self'` stays
 * intact, exactly like `/w.js`.
 */
(function () {
	'use strict';

	// Global Privacy Control (and the legacy Do-Not-Track) is an explicit
	// opt-out: no beacon, no cookie, identity stays the IP+UA hash.
	if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;

	var ud = navigator.userAgentData;
	var tz = '';
	try {
		tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
	} catch (e) {
		/* no timezone signal — the fingerprint is still built without it */
	}

	var sigs = {
		b: ud && ud.brands ? ud.brands.map(function (x) { return x.brand + ' ' + x.version; }) : null,
		p: (ud && ud.platform) || navigator.platform || '',
		m: ud ? !!ud.mobile : false,
		t: navigator.maxTouchPoints || 0,
		l: navigator.language || '',
		z: tz,
		s: (screen.width || 0) + 'x' + (screen.height || 0),
		d: window.devicePixelRatio || 1
	};

	try {
		fetch('/analytics/beacon', {
			method: 'POST',
			body: JSON.stringify(sigs),
			keepalive: true
		}).catch(function () {});
	} catch (e) {
		/* no beacon, no problem — the server's IP+UA hash still counts */
	}
})();
