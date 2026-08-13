-- Sample content for local development. Applied with:
--
--   npx wrangler d1 execute ij5 --local --file scripts/seed.sql
--
-- The homepage is one Markdown document; D1 is its source of truth, KV the
-- published mirror. Seeded rows show up on `/` immediately and can then be
-- published from the editor to exercise the version-keyed cache.

-- Identity and copy follow injoon5.com — name, GitHub, email, and the intro
-- from the homepage.

UPDATE profile SET
  name    = 'Injoon Oh',
  tagline = NULL,
  links   = '[{"label":"GitHub","href":"https://github.com/injoon5","icon":"github"},{"label":"Email","href":"mailto:injoon5@icloud.com","icon":"mail"}]',
  content = 'I am a student who is interested in math, science, and computers. I love exploring new concepts and getting to know cool new things. Whether it''s tackling complex equations, researching about scientific stuff, or trying the latest tech, I''m always eager to learn.

:::links
github    | GitHub     | https://github.com/injoon5 | Code and experiments
mail      | Email      | mailto:injoon5@icloud.com | Say hello
:::

## Now

A high-school student in Seoul who likes math, science, and computers. Nowadays I''m thinking about AI — but who knows?

::contributions
'
WHERE id = 1;
