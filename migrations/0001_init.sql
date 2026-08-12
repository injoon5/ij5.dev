-- ij5.dev initial schema (§3)
-- Applied explicitly: `wrangler d1 migrations apply ij5 --remote`.

CREATE TABLE slugs (
  slug          TEXT PRIMARY KEY,
  target_url    TEXT NOT NULL,
  status        INTEGER DEFAULT 302,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER
);

-- Identity rail. Single row, never more.
CREATE TABLE profile (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  name     TEXT NOT NULL,
  bio      TEXT,                        -- short paragraphs, newline-separated
  tagline  TEXT,                        -- one line under the bio
  avatar   TEXT,                        -- assets key
  links    TEXT NOT NULL DEFAULT '[]'   -- JSON: footer icon links
);

CREATE TABLE blocks (
  id       TEXT PRIMARY KEY,
  ord      INTEGER NOT NULL,
  kind     TEXT NOT NULL,               -- widget catalog, §7
  span     TEXT NOT NULL,               -- '1x1' | '2x1' | '2x2' | 'full'
  data     TEXT NOT NULL                -- JSON, validated by the kind's schema
);

CREATE TABLE assets (
  key   TEXT PRIMARY KEY,               -- content hash + ext
  mime  TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  w     INTEGER,
  h     INTEGER,
  at    INTEGER NOT NULL
);

-- Pre-aggregated on write, never rolled up, never pruned. The aggregate is
-- the storage, so counts are exact and history is permanent.
CREATE TABLE hits (
  day      TEXT    NOT NULL,            -- 'YYYY-MM-DD'
  slug     TEXT    NOT NULL,            -- slug for redirects, '' for bento, path for 404s
  kind     TEXT    NOT NULL,            -- redirect | bento | 404
  country  TEXT    NOT NULL,
  referrer TEXT    NOT NULL,            -- hostname only, 'direct' if none
  device   TEXT    NOT NULL,            -- mobile | desktop | bot
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, slug, kind, country, referrer, device)
);

-- Daily uniques without cookies. `vh` rotates with the day.
CREATE TABLE visitors (
  day  TEXT NOT NULL,
  slug TEXT NOT NULL,
  vh   TEXT NOT NULL,
  PRIMARY KEY (day, slug, vh)
);

-- The primary keys lead with `day`, so per-slug queries would otherwise scan
-- every row in the date range.
CREATE INDEX visitors_day  ON visitors(day);
CREATE INDEX visitors_slug ON visitors(slug, day);
CREATE INDEX hits_slug     ON hits(slug, day);

INSERT INTO profile (id, name, bio, tagline, links)
VALUES (1, 'ij5', NULL, NULL, '[]');
