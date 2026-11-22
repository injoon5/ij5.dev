-- ij5.dev per-app key-value data for Shelf apps.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- D1 rather than Workers KV: KV can take a minute to show a write everywhere,
-- so a value saved on the phone could read back stale on the web. D1 reads
-- back its own writes immediately.
--
-- A delete sets `value` to NULL and keeps the row (a tombstone), so other
-- devices learn about it on their next `?since=` sync. Tombstones older than
-- 30 days are purged when the app is next written to.
--
-- The slug needs no row in `apps`: the store can back a script or a page too.

CREATE TABLE app_data (
  slug       TEXT NOT NULL,
  key        TEXT NOT NULL,            -- 1–128 chars, printable, no "/"
  value      TEXT,                     -- JSON; NULL is a tombstone
  rev        INTEGER NOT NULL,         -- global, strictly increasing
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (slug, key)
);
CREATE INDEX app_data_rev ON app_data (slug, rev);

-- The revision counter, one row. `MAX(rev) + 1` over `app_data` would be one
-- statement fewer, but the maximum can go *down* — deleting an app's data or
-- purging a tombstone can remove the row that held it — and a client resuming
-- from a rev it has already seen would then silently miss the next writes.
-- A counter only ever goes up. It is bumped in the same `DB.batch` as the
-- write, which D1 runs as one transaction.
CREATE TABLE app_data_counter (
  one INTEGER PRIMARY KEY CHECK (one = 1),
  rev INTEGER NOT NULL
);
INSERT INTO app_data_counter (one, rev) VALUES (1, 0);
