-- ij5.dev plaintext pastes.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- A paste is plaintext served at a root slug, in the same namespace as links:
-- the hook checks `slug:` (redirect) first and `paste:` second. D1 is the
-- source of truth; `paste:{slug}` in KV is the read path for the hook, mirror
-- of the `slugs` contract so the two can only disagree for one await.

CREATE TABLE pastes (
  slug       TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
