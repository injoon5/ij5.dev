-- ij5.dev — per-paste cache opt-out.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- A paste whose content may change (configs, notes being edited elsewhere) can
-- opt out of edge caching entirely: the hook then answers `no-store` and never
-- fills the Cache API, so every view reads fresh KV. Off by default — caching
-- is what makes pastes cheap to serve.

ALTER TABLE pastes ADD COLUMN cache INTEGER NOT NULL DEFAULT 1;
