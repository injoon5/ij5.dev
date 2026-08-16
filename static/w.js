/*
 * The only script the public page ever loads, and only when a block on it
 * actually needs one. Two behaviours, no framework, no state.
 *
 * It is a file rather than an inline script so `script-src 'self'` stays
 * intact: hashing inline handlers would mean `unsafe-hashes`, and reaching for
 * `unsafe-inline` would defeat the directive entirely. One small immutable
 * request is the cheaper trade.
 */
(function () {
	'use strict';

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
		// so a vertical wheel pans it horizontally while there is anything
		// to pan in that direction.
		grass.addEventListener(
			'wheel',
			function (event) {
				if (grass.scrollWidth - grass.clientWidth <= 0) return;
				var d = event.deltaY;
				if (event.deltaMode === 1) d *= 16;
				else if (event.deltaMode === 2) d *= window.innerHeight;
				if (event.deltaX) d += event.deltaX;
				if (d === 0) return;
				// Only swallow the wheel while the pan actually moves. At the edge
				// scrollLeft does not change, so the event is left to scroll the
				// page instead of trapping it. Comparing before and after
				// sidesteps the RTL scroll-offset disagreement between engines: it
				// asks whether the pan moved, not which way the numbers run.
				var before = grass.scrollLeft;
				grass.scrollLeft += d;
				if (grass.scrollLeft !== before) event.preventDefault();
			},
			{ passive: false }
		);
		paintGrass();
	}
})();
