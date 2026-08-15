-- ij5.dev file sharing.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- A file is bytes in R2 (key `dl/{slug}`) with this row as its catalog entry.
-- The slug namespace is shared with links and pastes: creation on any side
-- rejects a name the others already own, and `d` is reserved so no link can
-- shadow the `/d/` namespace. The download route checks expiry lazily on
-- read, and `downloads` is a running counter bumped on every served download.

CREATE TABLE files (
  slug       TEXT PRIMARY KEY,
  key        TEXT NOT NULL,            -- R2 object key: `dl/{slug}`
  name       TEXT NOT NULL,            -- original filename, for display and Content-Disposition
  mime       TEXT NOT NULL,            -- declared type; served as attachment anyway
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  downloads  INTEGER NOT NULL DEFAULT 0
);
