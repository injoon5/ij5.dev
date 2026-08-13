-- ij5.dev — the bento block model is gone; the homepage is one Markdown
-- document (§2). `blocks` has been retired since 0002 and nothing has read it
-- in that time — the migration that retired it explicitly left the table for a
-- later cleanup once the content had been migrated by hand. It has been.
-- Dropping it now is what makes the dead schema actually dead.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

DROP TABLE IF EXISTS blocks;
