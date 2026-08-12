-- Sample content for local development. Applied with:
--
--   npx wrangler d1 execute ij5 --local --file scripts/seed.sql
--
-- The bento reads the published KV document first and falls back to D1, so
-- seeded rows show up on `/` immediately and can then be published from the
-- editor to exercise the version-keyed cache.

DELETE FROM blocks;

UPDATE profile SET
  name    = 'Ivan Jeong',
  tagline = 'Design engineer. I build small, fast things on the edge.',
  bio     = 'I work on interfaces where the details are the product — the kind of software people like using without being able to say why.

Currently building tools for people who ship on their own. Previously infrastructure and developer experience.',
  links   = '[{"label":"GitHub","href":"https://github.com/","icon":"github"},{"label":"X","href":"https://x.com/","icon":"x"},{"label":"LinkedIn","href":"https://linkedin.com/","icon":"linkedin"},{"label":"Email","href":"mailto:hey@ij5.dev","icon":"mail"}]'
WHERE id = 1;

INSERT INTO blocks (id, ord, kind, span, data) VALUES
  ('b-cta', 0, 'cta', '2x1',
   '{"label":"Work with me","url":"https://ij5.dev/contact","description":"Taking on one project at a time."}'),

  ('b-stat', 1, 'stat', '1x1',
   '{"value":"14","label":"Things shipped","note":"this year"}'),

  ('b-clock', 2, 'clock', '1x1',
   '{"place":"Seoul","offset":"UTC+9"}'),

  ('b-gh', 3, 'github', '1x1',
   '{"owner":"sveltejs","repo":"kit","fallbackValue":"19k","fallbackLabel":"TypeScript"}'),

  ('b-contact', 4, 'contact', '1x1',
   '{"email":"hey@ij5.dev","label":"Say hello"}'),

  ('b-head-writing', 5, 'heading', 'full',
   '{"text":"Writing","note":"occasional"}'),

  ('b-link-1', 6, 'link', '2x1',
   '{"title":"Why the redirect should not touch the framework","url":"https://ij5.dev/redirects","subtitle":"On short-circuiting before render"}'),

  ('b-link-2', 7, 'link', '1x1',
   '{"title":"Concentric radii","url":"https://ij5.dev/radii"}'),

  ('b-text', 8, 'text', '1x1',
   '{"title":"Now","body":"Rewriting the analytics pipeline so counts stay exact without an event stream."}'),

  ('b-head-work', 9, 'heading', 'full',
   '{"text":"Work"}'),

  ('b-timeline', 10, 'timeline', '2x2',
   '{"title":"Roles","items":[{"label":"Design engineer, independent","meta":"2023–now"},{"label":"Staff engineer, platform","meta":"2020–2023"},{"label":"Engineer, developer tools","meta":"2017–2020"}]}'),

  ('b-quote', 11, 'quote', '2x1',
   '{"quote":"All those unseen details combine to produce something that is just stunning.","author":"Paul Graham"}'),

  ('b-stack', 12, 'stack', '2x1',
   '{"title":"Stack","items":[{"label":"TypeScript"},{"label":"Svelte"},{"label":"Cloudflare"},{"label":"SQLite"},{"label":"Tailwind"}]}'),

  ('b-list', 13, 'list', '2x2',
   '{"title":"Elsewhere","items":[{"label":"Reading list","href":"https://ij5.dev/reading","meta":"2026"},{"label":"Uses","href":"https://ij5.dev/uses"},{"label":"Colophon","href":"https://ij5.dev/colophon"}]}'),

  ('b-social', 14, 'social', '1x1',
   '{"platform":"github","handle":"@ij5","url":"https://github.com/","count":"1.2k"}'),

  ('b-spacer', 15, 'spacer', '1x1', '{}');
