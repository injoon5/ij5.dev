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
npx wrangler secret put SESSION_SECRET   # rotating this logs everyone out
npx wrangler secret put SALT             # visitor hashing
npx wrangler secret put GITHUB_TOKEN     # optional, only for the grass widget
```

Generate a set with the snippet at the top of `.dev.vars.example`. The admin
token itself is never stored — keep it in a password manager; only its hash goes
to Cloudflare.

### 4. Point the domains

- `ij5.dev` → a Workers route or custom domain on the `ij5` Worker.
- `assets.ij5.dev` → a public custom domain on the `ij5-assets` R2 bucket. Upload
  URLs are built from `ASSETS_ORIGIN`, so images 404 until this exists.

Both origins are set as plain `vars` in `wrangler.jsonc`; change them there if
you deploy under different hostnames.

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

Then check `/` renders, `/login` accepts the admin token, and an image upload in
the editor returns an `assets.ij5.dev` URL.

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
