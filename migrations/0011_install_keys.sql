-- ij5.dev one-time install keys, and app history for Revert.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- A key is `shelf_ik_{id}_{secret}`. Only sha256(secret) is stored, the same
-- way `AUTH_HASH` is stored for the admin token. A null `slug` creates one new
-- app under a free slug; a set `slug` updates that app (and may read its
-- source). The first successful write sets `used_at`; five failed attempts
-- burn the key anyway; it expires 30 minutes after it is minted.
--
-- `claim` is a random value written by the request that consumes the key.
-- The app write in the same batch only happens if the key carries *its*
-- claim, so of two requests racing with one key exactly one can win — a
-- timestamp would not do, since two racers can share a millisecond.

CREATE TABLE install_keys (
  id          TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,            -- base64(sha256(secret))
  slug        TEXT,                     -- null: create one new app; set: update this app
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used_at     INTEGER,
  used_slug   TEXT,                     -- what it installed, for Shelf to pick up
  claim       TEXT
);

-- Every content change keeps the previous version here, the last 10 per app,
-- so a bad push (an agent's, usually) can be undone. The current version is
-- never in this table: Revert swaps the newest row with the current one, so
-- reverting twice is a redo.
CREATE TABLE app_versions (
  slug       TEXT NOT NULL,
  version    TEXT NOT NULL,
  name       TEXT NOT NULL,
  icon       TEXT,
  tint       TEXT NOT NULL,
  source     TEXT NOT NULL,
  origin     TEXT NOT NULL,             -- 'admin' | 'key'
  created_at INTEGER NOT NULL,          -- when it stopped being current
  PRIMARY KEY (slug, version)
);
