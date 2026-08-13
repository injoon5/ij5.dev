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

	// Contribution graph: fade the side with the hidden columns, so the fade
	// appears and disappears with the scroll position instead of staying
	// painted on both edges forever. Geometry, not `scrollLeft`, because RTL
	// scroll offsets disagree between engines. The mask is written here, not
	// in CSS, because a per-side alpha wants a single gradient that no
	// `mask-composite` expression reproduced consistently across engines.
	var grass = document.querySelector('.contrib-scroll');
	if (grass) {
		var grassGrid = grass.firstElementChild;
		var grassMask = grass.parentElement;
		var paintGrass = function () {
			var max = grass.scrollWidth - grass.clientWidth;
			if (max <= 0 || !grassGrid || !grassMask) {
				grassMask.style.maskImage = 'none';
				grassMask.style.webkitMaskImage = 'none';
				return;
			}
			var s = (grass.getBoundingClientRect().left - grassGrid.getBoundingClientRect().left) / max;
			if (s < 0) s = 0;
			else if (s > 1) s = 1;
			// Edge visibility, 1 = fully visible, 0 = faded out. Binary, so
			// the fade is always the same full 0.75rem gradient and only its
			// presence tracks the scroll: a side fades whenever columns are
			// cut off there, and clears when the pan reaches its end. The
			// epsilon absorbs sub-pixel geometry noise at the ends.
			var l = s > 0.01 ? 0 : 1;
			var r = s < 0.99 ? 0 : 1;
			var mask =
				'linear-gradient(to right, rgba(0,0,0,' +
				l +
				'), black 0.75rem, black calc(100% - 0.75rem), rgba(0,0,0,' +
				r +
				'))';
			grassMask.style.maskImage = mask;
			grassMask.style.webkitMaskImage = mask;
		};
		grass.addEventListener('scroll', paintGrass, { passive: true });
		window.addEventListener('resize', paintGrass, { passive: true });
		// With no visible scrollbar the wheel is the graph's only affordance,
		// so a vertical wheel pans it horizontally and is blocked from
		// scrolling the page — but only while there is anything to pan.
		grass.addEventListener(
			'wheel',
			function (event) {
				if (grass.scrollWidth - grass.clientWidth <= 0) return;
				var d = event.deltaY;
				if (event.deltaMode === 1) d *= 16;
				else if (event.deltaMode === 2) d *= window.innerHeight;
				if (event.deltaX) d += event.deltaX;
				if (d === 0) return;
				event.preventDefault();
				grass.scrollLeft += d;
			},
			{ passive: false }
		);
		paintGrass();
	}
})();
