-- ij5.dev apps for Shelf: one Swift file per app, run on the phone by Kiln.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- Apps live only under `/api/apps`; they never take a root slug, so they do
-- not share the links/pastes/files namespace.
--
-- `version` is a hash of the content (name, icon, tint, source), not a
-- counter: saving the same content twice leaves it unchanged, so the phone
-- downloads nothing, and two racing edits can never share a version.
-- `origin` records who wrote the current content ('admin' | 'key'), so the
-- history row it becomes on the next write keeps saying so.

CREATE TABLE apps (
  slug       TEXT PRIMARY KEY,         -- SLUG_PATTERN
  name       TEXT NOT NULL,            -- label under the icon, ≤ 32 chars
  icon       TEXT,                     -- SF Symbol name; null → "app"
  tint       TEXT NOT NULL,            -- one of TINTS
  source     TEXT NOT NULL,            -- ≤ MAX_APP_BYTES
  version    TEXT NOT NULL,            -- base64url(sha256(content)), 16 chars
  origin     TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
