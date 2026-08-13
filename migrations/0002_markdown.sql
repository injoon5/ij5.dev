-- ij5.dev — homepage becomes a single Markdown document.
-- The bento block model is retired; `/` now renders `profile.content` (Markdown)
-- as a minimalist prose page. Applied with:
--   `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- One Markdown body for the whole page. Nullable so an unmigrated row still loads.
ALTER TABLE profile ADD COLUMN content TEXT;

-- Seed a starter document so the page is never blank on first render. The
-- masthead (name/tagline/avatar) still comes from the profile columns; this is
-- the body beneath it.
UPDATE profile
SET content = 'I design and build software on the web. This page is written in Markdown — prose, links, and the occasional picture.

:::links
github    | GitHub      | https://github.com/injoon5   | Code and experiments
mail      | Email       | mailto:injoon5@icloud.com   | Say hello
:::

## Now

Making small, fast, well-made things. Fewer features, better ones.

::contributions
'
WHERE id = 1;

-- The `blocks` table is intentionally left in place: dropping it here would be
-- destructive to existing rows and nothing reads it after this change. A later
-- migration can remove it once the content has been migrated by hand.
