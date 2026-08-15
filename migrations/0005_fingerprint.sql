-- ij5.dev — richer device breakdown (§6). Same pre-aggregated-on-write model
-- as `hits`, but without the dimensions that would blow up its primary key:
-- no country, no referrer, no device class (bot rows are never written, so the
-- dashboard's "exclude bots" convention is a write-time decision instead of a
-- query-time one).
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

CREATE TABLE hits_device (
  day     TEXT NOT NULL,            -- 'YYYY-MM-DD'
  slug    TEXT NOT NULL,            -- slug for redirects, '' for home, path for 404s
  kind    TEXT NOT NULL,            -- redirect | paste | home | 404
  os      TEXT NOT NULL,            -- Windows | macOS | iOS | Android | …
  browser TEXT NOT NULL,            -- Chrome | Safari | Firefox | …
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, slug, kind, os, browser)
);

-- Mirrors the `hits` indexes: `day` for the range queries, (slug, day) for the
-- per-slug breakdown.
CREATE INDEX hits_device_day  ON hits_device(day);
CREATE INDEX hits_device_slug ON hits_device(slug, day);
