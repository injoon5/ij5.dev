/*
 * The only script the public page ever loads, and only when a block on it
 * actually needs one. Three behaviours, no framework, no state.
 *
 * It is a file rather than an inline script so `script-src 'self'` stays
 * intact: hashing inline handlers would mean `unsafe-hashes`, and reaching for
 * `unsafe-inline` would defeat the directive entirely. One small immutable
 * request is the cheaper trade.
 */
(function () {
	'use strict';

	var live;

	/* The copy confirmation is an icon swap, which no screen reader sees. */
	function say(message) {
		if (!live) {
			live = document.createElement('p');
			live.setAttribute('role', 'status');
			live.setAttribute(
				'style',
				'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'
			);
			document.body.appendChild(live);
		}
		live.textContent = '';
		setTimeout(function () {
			live.textContent = message;
		}, 50);
	}

	function legacyCopy(text) {
		try {
			var field = document.createElement('textarea');
			field.value = text;
			field.setAttribute('readonly', '');
			field.setAttribute('style', 'position:fixed;top:0;left:-9999px');
			document.body.appendChild(field);
			field.select();
			var ok = document.execCommand('copy');
			field.remove();
			return ok;
		} catch (e) {
			return false;
		}
	}

	document.addEventListener('click', function (event) {
		var target = event.target;
		if (!(target instanceof Element)) return;

		var copy = target.closest('[data-copy]');
		if (copy) {
			event.preventDefault();
			var text = copy.getAttribute('data-copy') || '';

			var settle = function (attr, message) {
				copy.setAttribute(attr, '');
				say(message);
				setTimeout(function () {
					copy.removeAttribute(attr);
				}, 1600);
			};
			var done = function () {
				settle('data-copied', 'Copied ' + text);
			};
			// The clipboard API is unavailable outside a secure context and can
			// reject on focus or permissions. Both used to end in silence.
			var failed = function () {
				if (legacyCopy(text)) done();
				else settle('data-copy-failed', 'Could not copy. Select the address to copy it.');
			};

			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(done, failed);
			} else {
				failed();
			}
			return;
		}

		// Embed facade: the poster is real markup, the iframe arrives only once
		// someone has asked for it.
		var play = target.closest('[data-embed]');
		var src = play && play.getAttribute('data-embed');
		if (play && src) {
			event.preventDefault();
			var frame = document.createElement('iframe');
			frame.src = src;
			frame.title = play.getAttribute('data-embed-title') || '';
			frame.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
			frame.allowFullscreen = true;
			frame.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;border:0');
			var widget = play.closest('[data-span]');
			if (widget) widget.replaceChildren(frame);
		}
	});

	// Live local clocks. The server rendered each clock's offset — correct for
	// as long as the cache holds the page — and this upgrades it to the actual
	// wall-clock time at that place, held on the minute. A clock whose offset
	// did not parse carries no `data-tz-offset` and is left as written.
	(function clocks() {
		var els = document.querySelectorAll('[data-clock][data-tz-offset]');
		if (!els.length) return;

		function pad(n) {
			return n < 10 ? '0' + n : '' + n;
		}

		function tick() {
			var now = Date.now();
			for (var i = 0; i < els.length; i++) {
				var off = parseInt(els[i].getAttribute('data-tz-offset'), 10);
				if (isNaN(off)) continue;
				// Shift the UTC instant by the offset, then read UTC parts: that is
				// the place's wall time without re-applying the viewer's own zone.
				var t = new Date(now + off * 60000);
				els[i].textContent = pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes());
			}
		}

		tick();
		// Land the first update on the next minute boundary, then keep to it, so
		// every clock flips its minute together rather than on load-time phase.
		setTimeout(function () {
			tick();
			setInterval(tick, 60000);
		}, 60000 - (Date.now() % 60000));
	})();

	// `error` does not bubble, so this listens in the capture phase. A missing
	// R2 object then collapses to the widget surface rather than showing a
	// broken-image glyph.
	document.addEventListener(
		'error',
		function (event) {
			var img = event.target;
			if (!(img instanceof HTMLImageElement)) return;
			img.style.display = 'none';
			var widget = img.closest('[data-span]');
			if (widget) widget.setAttribute('data-image-failed', '');
		},
		true
	);
})();
