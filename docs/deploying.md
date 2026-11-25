# Deploying

The site is a SvelteKit app on Cloudflare Workers, with KV, D1, and R2 attached.
`npm run build` writes a Worker to `.svelte-kit/cloudflare/`, and `wrangler`
uploads it.

## Prerequisites

- Node 22 or newer (the test suite uses `node:sqlite`).
- A Cloudflare account, and `npx wrangler login` once per machine.
- `npm ci`.

## One-time setup

Everything below is per-account. Skip it if the resources already exist and
`wrangler.jsonc` already has real IDs.

### 1. Create the storage

```sh
npx wrangler kv namespace create KV
npx wrangler d1 create ij5
npx wrangler r2 bucket create ij5-assets
```

Copy the printed IDs into `wrangler.jsonc`, replacing `PLACEHOLDER_KV_ID` and
`PLACEHOLDER_D1_ID`. These IDs are not secret and belong in the repo.

### 2. Apply the schema

```sh
npm run db:migrate
```

That is `wrangler d1 migrations apply ij5 --remote`. Migrations are never applied
automatically — run this yourself whenever `migrations/` gains a file, before the
deploy that needs it.

### 3. Set the secrets

Secrets go through `wrangler secret put`, never into `vars` in `wrangler.jsonc`.

```sh
npx wrangler secret put AUTH_HASH        # base64(SHA-256(admin token))
npx wrangler secret put SESSION_SECRET   # signs puzzle grids
npx wrangler secret put SALT             # visitor hashing
npx wrangler secret put GITHUB_TOKEN     # optional, only for the grass widget
```

Sessions live in D1, so rotating `SESSION_SECRET` no longer signs anyone out.
Use **Sign out everywhere else** on `/admin/security` for that. The secrets for
signing in without a device and for Cloudflare Access are in
[Signing in](#signing-in) below.

Generate a set with the snippet at the top of `.dev.vars.example`. The admin
token itself is never stored — keep it in a password manager; only its hash goes
to Cloudflare.

### 4. Point the domains

- `ij5.dev` → a Workers route or custom domain on the `ij5` Worker.
- `assets.ij5.dev` → a public custom domain on the `ij5-assets` R2 bucket. Upload
  URLs are built from `ASSETS_ORIGIN`, so images 404 until this exists.

Both origins are set as plain `vars` in `wrangler.jsonc`; change them there if
you deploy under different hostnames.

### 5. Match the upload limit to the plan

Shared files go to R2 in parts, one request per part, so a part has to fit the
zone's request-body limit. `UPLOAD_PART_MIB` in `wrangler.jsonc` sets the part
size, and the largest file is 10,000 of those parts:

| Zone plan  | Request limit | `UPLOAD_PART_MIB` | Largest file |
| ---------- | ------------- | ----------------- | ------------ |
| Free / Pro | 100 MB        | `90` (default)    | ≈ 879 GB     |
| Business   | 200 MB        | `190`             | ≈ 1.8 TB     |
| Enterprise | up to 5 GB    | `500`             | ≈ 4.8 TB     |

R2 caps an object at 5 TiB less 5 GiB whatever the setting. Uploads that are
started and never finished are discarded by R2 after seven days.

## Signing in

There are four ways in, strongest first. Passkeys and the token need nothing
beyond the setup above. The other two are for when you have none of your
devices with you.

| Door                      | Session                    | Needs                         |
| ------------------------- | -------------------------- | ----------------------------- |
| Passkey                   | full, 30 days              | a registered passkey          |
| Admin token               | full, 30 days              | `AUTH_HASH`                   |
| Password + recovery code  | full, 30 days              | password secrets + printed codes |
| Password + puzzle         | limited, 1 hour, tab only  | password secrets              |

A **limited** session can read everything and create or edit, but cannot touch
`/admin/security` (passkeys, recovery codes, other sessions) or delete anything.
Every password sign-in is logged on the security page and, if `ALERT_URL` is set,
pushed to your phone.

### The password and the puzzle

```sh
node scripts/auth.mjs password   # asks for the password; prints PASSWORD_PEPPER and PASSWORD_HASH
node scripts/auth.mjs puzzle     # deals a random PUZZLE_PATH (or: puzzle "A1 B2 C3 C4")
npx wrangler secret put PASSWORD_PEPPER
npx wrangler secret put PASSWORD_HASH
npx wrangler secret put PUZZLE_PATH
```

The puzzle is a 4×4 grid of digits, new on every load. Columns are A–D and rows
1–4. Your route is a few cells, say `A1 B2 C3 C4`, and the answer is the digits on
it, in order. Remember the route; the digits change every time. Each grid takes
one answer, so a keylogged sign-in cannot be replayed.

The password is hashed with Argon2id (19 MiB, 2 passes, about 120 ms of CPU, so
it needs the paid Workers plan) and keyed with `PASSWORD_PEPPER`. To change it,
run the script again with `PASSWORD_PEPPER=<current pepper>` in the environment
and put the new `PASSWORD_HASH`, or leave it out and replace both.

In `.dev.vars`, use the escaped line the script prints. Wrangler expands `$NAME`
in that file, which silently breaks an unescaped hash.

Five wrong tries lock the password from your address, starting at a minute and
doubling. Twenty from anywhere lock it for everyone, for at most an hour.
Passkeys are never locked. Recovery codes count separately, so a flood against
the puzzle never blocks them.

Then sign in with a passkey, open `/admin/security`, choose **Make recovery
codes**, and print the ten codes. Each one works once, together with the password.

### Optional: alerts and Turnstile

```sh
npx wrangler secret put ALERT_URL           # e.g. https://ntfy.sh/<long random topic>
npx wrangler secret put TURNSTILE_SECRET
```

`ALERT_URL` gets a plain-text POST with ntfy's headers on every password sign-in.
Any endpoint that accepts a POST works.

For Turnstile, create a widget for `ij5.dev` in the dashboard, add
`TURNSTILE_SITE_KEY` to `vars`, and set the secret. The password doors then need
a Turnstile pass, which protects the global lock from scripts. Leave both unset
to run without it.

### Cloudflare Access (OpenID Connect)

ij5.dev can be a login method for Access, so every app behind Access can be
reached with these doors, including from a borrowed computer.

1. Generate the key and the client secret:

   ```sh
   node scripts/auth.mjs oidc-key      # OIDC_PRIVATE_JWK
   node scripts/auth.mjs oidc-client   # prints the client secret once, and its hash
   npx wrangler secret put OIDC_PRIVATE_JWK
   npx wrangler secret put OIDC_CLIENT_SECRET_HASH
   npx wrangler secret put OIDC_EMAIL     # the address your Access policies allow
   ```

   Add to `vars`: `OIDC_CLIENT_ID` (any random string) and `OIDC_REDIRECT_URI`
   (`https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`). The redirect
   URI must match exactly.

2. In Zero Trust go to **Integrations → Identity providers → Add → OpenID
   Connect**, and fill in:

   | Field           | Value                              |
   | --------------- | ---------------------------------- |
   | App ID          | `OIDC_CLIENT_ID`                   |
   | Client secret   | the secret `oidc-client` printed   |
   | Auth URL        | `https://ij5.dev/oauth/authorize`  |
   | Token URL       | `https://ij5.dev/oauth/token`      |
   | Certificate URL | `https://ij5.dev/oauth/jwks`       |
   | PKCE            | **on** (it is required here)       |
   | OIDC claims     | `strength`, `amr`                  |

   Use **Test** to check the round trip.

3. Add ij5.dev as a login method to your Access apps, alongside the one you use
   now.

4. For apps that matter most, add a rule that requires the OIDC claim
   `strength` to equal `full`. A password + puzzle sign-in then cannot open them,
   while a passkey or recovery code still can.

The ID token is RS256, the only family Access verifies besides PS512. It carries
`email`, `strength` (`full` or `limited`), `amr` and `auth_time`. Codes last 60
seconds and work once. There are no refresh tokens: Access keeps its own session.
**Access's session is not shortened by a limited sign-in here**, so give apps you
might open from a borrowed computer a short session duration. When you are done
on someone else's machine, open `https://<team>.cloudflareaccess.com/cdn-cgi/access/logout`.

Discovery is at `https://ij5.dev/.well-known/openid-configuration`. Every OIDC
route answers 404 until all of the `OIDC_*` values are set.

## Deploying

Run the same three checks CI runs, then ship:

```sh
npm run check   # types
npm test        # unit tests
npm run build   # Worker bundle
npm run deploy  # wrangler deploy
```

CI (`.github/workflows/ci.yml`) runs the first three on every push and PR, so a
green pipeline is a deploy that would have succeeded. CI does not deploy — that
is deliberate.

### Gradual rollout

For anything touching the redirect hook or `hooks.server.ts`, upload a version
instead of overwriting production, then move traffic to it:

```sh
npx wrangler versions upload
npx wrangler versions deploy   # pick the version, choose a percentage
```

Roll back by deploying the previous version the same way.

## Verifying

```sh
npx wrangler tail          # live logs
```

Then check that `/` renders, `/login` accepts the admin token (and the password +
puzzle, if set up), `/admin/security` can add a passkey, and an image upload in the
editor returns an `assets.ij5.dev` URL.

The release that introduced D1 sessions (migration `0012`) signs everyone out
once. Old cookies are simply ignored. Apply the migration before deploying it.

Passkeys are scoped to a domain: a key registered against `localhost` in dev will
not work against `ij5.dev` in production, and vice versa. Register one on each
origin you actually sign in from.

Observability is on in `wrangler.jsonc`; watch **CPU time** in the dashboard, not
wall-clock — wall-clock includes waiting on KV and D1 and will look alarming for
no reason.

## Local preview

`npm run dev` is Vite. To run the real Worker locally:

```sh
cp .dev.vars.example .dev.vars   # fill it in
npm run db:migrate:local
npx wrangler d1 execute ij5 --local --file scripts/seed.sql
npm run build && npm run preview
```

`preview` is `wrangler dev`, so it serves the built Worker against local KV, D1,
and R2 in `.wrangler/`. Nothing there touches production.
