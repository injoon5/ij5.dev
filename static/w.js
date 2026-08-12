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

	document.addEventListener('click', function (event) {
		var target = event.target;
		if (!(target instanceof Element)) return;

		var copy = target.closest('[data-copy]');
		if (copy) {
			event.preventDefault();
			var text = copy.getAttribute('data-copy') || '';
			var done = function () {
				copy.setAttribute('data-copied', '');
				setTimeout(function () {
					copy.removeAttribute('data-copied');
				}, 1600);
			};
			if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
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
})();
