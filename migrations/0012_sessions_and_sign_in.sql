-- ij5.dev — server-side sessions, password + puzzle sign-in, recovery codes,
-- and the OpenID Connect codes Cloudflare Access redeems.
-- Applied with: `wrangler d1 migrations apply ij5 --remote` (or `--local`).

-- One row per signed-in browser. The cookie holds a random 256-bit token;
-- only base64url(sha256(token)) is stored, so a leaked table cannot be replayed
-- as cookies. `strength` decides what the session may do: a `limited` one
-- (password + puzzle) cannot touch security settings or delete anything.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,          -- base64url(sha256(cookie token))
  strength     TEXT NOT NULL,             -- 'full' | 'limited'
  method       TEXT NOT NULL,             -- 'passkey' | 'token' | 'password' | 'recovery'
  created_at   INTEGER NOT NULL,          -- also the OIDC `auth_time`
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  ip           TEXT,
  country      TEXT,
  user_agent   TEXT
);
CREATE INDEX sessions_expires ON sessions (expires_at);

-- Failed-guess counters for the password door. `bucket` is `pw:ip:<addr>`,
-- `pw:global`, and the same pair under `rc:` for recovery codes, so a flood
-- against one door never locks the other. Counters reset a day after the last
-- failure.
CREATE TABLE auth_throttle (
  bucket          TEXT PRIMARY KEY,
  failures        INTEGER NOT NULL DEFAULT 0,
  last_failure_at INTEGER NOT NULL,
  locked_until    INTEGER NOT NULL DEFAULT 0
);

-- A puzzle grid is signed, not stored: a row appears only once someone
-- answers it, and a second answer to the same grid is refused. That is what
-- makes a keylogged (grid, answer) pair useless.
CREATE TABLE puzzle_used (
  nonce      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Paper recovery codes. 50 random bits each, so a plain SHA-256 is enough;
-- each one works once.
CREATE TABLE recovery_codes (
  hash       TEXT PRIMARY KEY,           -- base64url(sha256(normalised code))
  created_at INTEGER NOT NULL,
  used_at    INTEGER
);

-- Sign-ins, failures and lockouts, newest kept, shown on the security page.
CREATE TABLE auth_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  kind       TEXT NOT NULL,              -- 'sign-in' | 'failed' | 'locked' | 'sign-out-all'
  method     TEXT,
  ip         TEXT,
  country    TEXT,
  user_agent TEXT
);

-- Authorization codes for the one OIDC client (Cloudflare Access). Single use:
-- the token endpoint takes a code with `DELETE … RETURNING`, which D1 runs
-- atomically — a KV get-then-delete could be replayed inside its consistency
-- window.
CREATE TABLE oidc_codes (
  hash           TEXT PRIMARY KEY,       -- base64url(sha256(code))
  client_id      TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,          -- PKCE, S256 only
  nonce          TEXT,
  scope          TEXT NOT NULL,
  session_id     TEXT NOT NULL,
  strength       TEXT NOT NULL,
  method         TEXT NOT NULL,
  auth_time      INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL
);
