-- ij5.dev — WebAuthn passkeys for the admin sign-in (§4).
-- A passkey is a public-key credential: the private key lives in the user's
-- authenticator and never leaves it; D1 keeps only the public half plus the
-- signature counter that detects a cloned authenticator. Challenges are
-- short-lived KV values, not rows. Applied with:
--   `wrangler d1 migrations apply ij5 --remote` (or `--local`).

CREATE TABLE passkeys (
  id          TEXT PRIMARY KEY,           -- base64url credential id
  name        TEXT NOT NULL,              -- your label: "MacBook Touch ID"
  public_key  TEXT NOT NULL,              -- base64url COSE public key
  counter     INTEGER NOT NULL DEFAULT 0, -- authenticator signature counter
  transports  TEXT NOT NULL DEFAULT '[]', -- JSON array of transport hints
  created_at  INTEGER NOT NULL,
  last_used_at INTEGER
);
