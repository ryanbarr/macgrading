# Railway rollout runbook

One-time procedure to stand up production for MAC Grading: one Railway
project (`macgrading`), three services (Postgres, `api`, `web`), served at
`macgrading.com` / `api.macgrading.com`, with photos in Cloudflare R2.

This is an interactive session run by a human plus the controlling agent
(via the Railway MCP tools). Steps are ordered — later steps consume values
recorded in earlier ones. Every `<angle-bracket>` marks a value that does not
exist yet and must be filled in from the step that produces it; there are no
other placeholders in this document.

---

## 1. Prereqs (human)

Do these in the Cloudflare and Google consoles before touching Railway.
Record every value below — later steps reference them by name.

### Cloudflare R2 (photo storage)

1. Cloudflare dashboard → R2 → **Create bucket** → name it exactly
   `macgrading-photos`.
2. Open the bucket → **Settings** → **Public access** → enable the
   **public dev URL**. Record it: `<r2-public-dev-url>`
   (form `https://pub-<hash>.r2.dev`).
3. R2 → **Manage API tokens** → **Create API token** → permission
   **Object Read & Write**, scoped to the `macgrading-photos` bucket only.
   Record:
   - Access key ID: `<r2-access-key-id>`
   - Secret access key: `<r2-secret-access-key>` (shown once — copy it now)
   - Account ID (shown on the same page or the R2 overview page):
     `<r2-account-id>`
   - S3 endpoint, built from the account ID:
     `https://<r2-account-id>.r2.cloudflarestorage.com`

### Google OAuth (admin sign-in)

4. Google Cloud console → **APIs & Services → Credentials** → **Create
   credentials → OAuth client ID** → application type **Web application**.
5. Under **Authorized JavaScript origins**, add `https://macgrading.com`.
   No redirect URI is needed (Google Identity Services uses the origin, not
   a redirect).
6. Save. Record the client ID: `<google-oauth-client-id>`
   (form `<numbers>-<hash>.apps.googleusercontent.com`).

### JWT secret

7. Generate a fresh 256-bit secret locally:

   ```bash
   openssl rand -hex 32
   ```

   Record the output: `<jwt-secret>`. This value only needs to exist in
   Railway's env — do not commit it or paste it anywhere else.

### CardboardTens

8. If you have a live CardboardTens API key, record it:
   `<cardboardtens-api-key>` and its API URL `<cardboardtens-api-url>`
   (`https://www.cardboardtens.com/api/v1` unless CardboardTens tells you
   otherwise). If you don't have one yet, skip — leaving these unset in
   Railway makes the API fall back to its built-in stub catalog, same as
   local dev.

At the end of this section you should have seven recorded values:
`<r2-public-dev-url>`, `<r2-access-key-id>`, `<r2-secret-access-key>`,
`<r2-account-id>` (and its derived S3 endpoint), `<google-oauth-client-id>`,
`<jwt-secret>`, and optionally the two CardboardTens values.

---

## 2. Railway (via MCP)

Done through the Railway MCP tools, driven by the controller with the human
present to authenticate and confirm each write.

1. **Authenticate** the Railway MCP to your Railway account if not already
   connected.
2. **Create project** named `macgrading`.
3. **Add Postgres**: add the Railway-managed Postgres plugin/service to the
   project. Railway exposes its connection info as service variables you can
   reference from other services — no manual value to record.
4. **Add service `api`** from the GitHub repo:
   - Root directory: `/` (repo root)
   - Dockerfile path: `apps/api/Dockerfile`
   - Build context: repo root (so `packages/shared` resolves)
   - Pre-deploy command: `pnpm exec prisma migrate deploy` works as-is because
     the image's `WORKDIR` is already `/app/apps/api`. If the Railway service
     config has no separate "working directory" field for the pre-deploy
     command, use `cd /app/apps/api && pnpm exec prisma migrate deploy`
     as the belt-and-suspenders fallback.
   - Healthcheck path: `/health` (expects HTTP 200,
     `{"status":"ok"}`)
   - Watch paths: `apps/api/**`, `packages/shared/**`
   - Environment variables (runtime, not build-time):

     | Var | Value |
     |---|---|
     | `DATABASE_URL` | reference to the Postgres service's connection string (Railway "variable reference", not a literal — pick it from the Postgres service in the Railway UI/MCP) |
     | `NODE_ENV` | `production` |
     | `CORS_ORIGIN` | `https://macgrading.com,https://www.macgrading.com` (comma-separated — `main.ts` splits on `,`; both are live custom domains on `web`, so both must be allowed or the `www` origin fails CORS on admin sign-in/cert lookup/presign) |
     | `THROTTLE_TTL_SECONDS` | `60` |
     | `THROTTLE_LIMIT` | `100` |
     | `JWT_SECRET` | `<jwt-secret>` from step 1.7 |
     | `GOOGLE_CLIENT_ID` | `<google-oauth-client-id>` from step 1.6 |
     | `CARDBOARDTENS_API_KEY` | `<cardboardtens-api-key>` from step 1.8 (leave unset for the stub catalog) |
     | `CARDBOARDTENS_API_URL` | `<cardboardtens-api-url>` from step 1.8 (leave unset for the stub catalog) |
     | `S3_ENDPOINT` | `https://<r2-account-id>.r2.cloudflarestorage.com` from step 1.3 |
     | `S3_ACCESS_KEY` | `<r2-access-key-id>` from step 1.3 |
     | `S3_SECRET_KEY` | `<r2-secret-access-key>` from step 1.3 |
     | `S3_BUCKET` | `macgrading-photos` |
     | `S3_REGION` | `auto` (R2's required region value for its S3-compatible API; not in the design spec's env table, but `S3_REGION` is a required, validated env var — `apps/api/src/config/env.validation.ts` — the API refuses to boot without it) |
     | `S3_PUBLIC_BASE_URL` | `<r2-public-dev-url>` from step 1.2 |

     Do **not** set `AUTH_DEV_MODE` — it must stay unset in production (the
     dev email sign-in is hard-blocked whenever `NODE_ENV` isn't
     `development`/`test`, but leave it unset regardless, matching
     `.env.example`).
5. **Add service `web`** from the GitHub repo:
   - Root directory: `/` (repo root)
   - Dockerfile path: `apps/web/Dockerfile`
   - Build context: repo root
   - Watch paths: `apps/web/**`, `packages/shared/**`
   - Build-time variables (Docker build args — these get inlined into the
     client bundle, they are not runtime env vars):

     | Build arg | Value |
     |---|---|
     | `NEXT_PUBLIC_API_URL` | `https://api.macgrading.com` |
     | `NEXT_PUBLIC_SITE_URL` | `https://macgrading.com` |
     | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `<google-oauth-client-id>` from step 1.6 (same client ID as `GOOGLE_CLIENT_ID` on `api`) |
     | `API_URL` | `http://api.railway.internal:3001` — **required**: server-side rendering reads this (not `NEXT_PUBLIC_API_URL`) and defaults to localhost without it; the `railway.internal` address keeps SSR traffic on the private network |

6. Trigger the first deploy for both services once GitHub is connected (or
   let it run automatically on the next push to `main` — see Section 4
   before that push if CI isn't proven green yet).

---

## 3. Domains

1. In Railway, on the `api` service, add custom domain `api.macgrading.com`.
   Railway will print a DNS target (a CNAME value, unique to your project)
   — record it: `<api-cname-target>`.
2. On the `web` service, add custom domains `macgrading.com` and
   `www.macgrading.com`. Railway prints DNS targets for each — record them:
   `<web-apex-target>` and `<web-www-target>` (these are commonly the same
   value as each other, but treat them as whatever Railway prints).

### DNS: Namecheap (current registrar/DNS)

3. Namecheap → Domain List → `macgrading.com` → **Advanced DNS**:
   - `ALIAS` record, host `@`, value `<web-apex-target>`.
   - `CNAME` record, host `www`, value `<web-www-target>`.
   - `CNAME` record, host `api`, value `<api-cname-target>`.
4. Wait for DNS propagation (Namecheap TTLs are usually short, but allow up
   to an hour), then confirm each domain shows "Active"/verified in
   Railway.

### DNS: Cloudflare (recommended path — move the zone first)

3. Cloudflare dashboard → **Add a site** → `macgrading.com` → follow the
   nameserver-change instructions, then update the nameservers at
   Namecheap to the two Cloudflare nameservers it gives you. Wait for
   Cloudflare to report the zone active.
4. In the Cloudflare DNS tab, add three `CNAME` records, all
   **DNS only** (grey cloud, not proxied, to start):
   - `@` → `<web-apex-target>` (Cloudflare flattens CNAME-at-apex
     automatically)
   - `www` → `<web-www-target>`
   - `api` → `<api-cname-target>`
5. Once the zone is on Cloudflare, you can later add a fourth record
   attaching `img.macgrading.com` to the `macgrading-photos` R2 bucket
   (R2 custom domains require the zone to already be on Cloudflare) and
   flip the `api` service's `S3_PUBLIC_BASE_URL` from the `pub-<hash>.r2.dev`
   URL to `https://img.macgrading.com` — a config-only change, no redeploy
   of code required.

---

## 4. Wait for CI

Do this only after `.github/workflows/ci.yml` has run green at least once
on GitHub (push or PR) — confirm on the repo's Actions tab before enabling.

1. On the `api` service in Railway: **Settings → Deploy → Wait for CI** →
   enable, targeting the GitHub check named `gates` (the single job in
   `ci.yml`).
2. On the `web` service: same — enable **Wait for CI** targeting `gates`.
3. Confirm: push a trivial commit to `main` and watch that the Railway
   deploy for both services stays queued until the `gates` check on that
   commit turns green, then proceeds automatically.

---

## 5. Smoke test

Run these after both services show a healthy deploy in Railway and DNS has
propagated (Section 3).

Note on `CORS_ORIGIN`: it lists both `https://macgrading.com` and
`https://www.macgrading.com` because both are live custom domains on `web`
(Section 3) and a browser call from whichever origin the operator lands on
must pass CORS. A `www`→apex redirect configured at Cloudflare (once the
zone has moved there) is a fine later alternative to visiting `www`
directly — at that point `CORS_ORIGIN` can shrink back to the single apex
origin.

1. **API health:**

   ```bash
   curl https://api.macgrading.com/health
   ```

   Expect `{"status":"ok"}`.

2. **Seed the first admin user.** Production starts with an empty `User`
   table, so the Google sign-in in the next step has nothing to match
   against yet. Open a Postgres shell against the Railway `postgres`
   service (Railway MCP/CLI `railway connect postgres`, or the "Query"
   tab in the Railway dashboard) and run exactly:

   ```sql
   INSERT INTO "User" (id, email, name, role, "isActive", "createdAt")
   VALUES (gen_random_uuid(), 'ryanbarr@gmail.com', 'Ryan', 'ADMIN', true, now());
   ```

   (The `User` table has no `updatedAt` column — see
   `apps/api/prisma/migrations/20260831184710_init/migration.sql` — so don't
   add one to this statement or the insert fails.) Add one row per
   additional team member the same way, changing `email`, `name`, and
   `role` (`ADMIN` or `TEAM_MEMBER`).

3. **Admin Google sign-in:**
   - Open `https://macgrading.com/admin` in a browser.
   - Click the Google sign-in button, choose the account matching the
     email you just inserted (`ryanbarr@gmail.com`).
   - Confirm you land on the signed-in admin UI (not an "unauthorized"
     error — if you see one, the email in the `User` row and the signed-in
     Google account don't match, or the account isn't `isActive`).

4. **Extract the admin JWT for the presign check.** With the admin tab
   still signed in, open browser devtools → Console, and run:

   ```js
   localStorage.getItem('macgrading.admin.jwt')
   ```

   Copy the returned string (no quotes) as `<admin-jwt>`.

5. **Cert lookup page.** No certs exist yet in a fresh production database.
   In the admin UI, create one cert (any grading flow that produces a cert
   number). Record its number as `<cert-number>` (format: 9 digits,
   zero-padded, e.g. `000000001`; test certs are prefixed `T`, prototypes
   `P`). Then open:

   ```
   https://macgrading.com/cert/<cert-number>
   ```

   and confirm the public cert page renders.

6. **Photo presign against R2.** Using `<admin-jwt>` and `<cert-number>`
   from the previous two steps:

   ```bash
   curl -X POST "https://api.macgrading.com/certs/<cert-number>/photos/presign" \
     -H "Authorization: Bearer <admin-jwt>" \
     -H "Content-Type: application/json" \
     -d '{"contentType": "image/jpeg"}'
   ```

   Expect a `201` with JSON `{"uploadUrl": "...", "objectKey": "..."}`
   where `uploadUrl` starts with
   `https://<r2-account-id>.r2.cloudflarestorage.com/macgrading-photos/`.
   That confirms the API is presigning against R2 correctly end to end.
   Do not actually PUT a file yet — full photo upload (the browser upload
   flow) is exercised by the mobile app in item 4's follow-up project, not
   part of this rollout's smoke test.

---

## 6. Rollback

- **Bad deploy (app-level regression):** Railway → the affected service →
  **Deployments** tab → find the last known-good deployment → **Redeploy**.
  This re-runs that build's image without rebuilding from source.
- **Bad migration (schema-level regression):** there are no down
  migrations in this project — `prisma migrate deploy` is forward-only.
  Rolling back a schema change means writing and deploying a new forward
  migration that undoes the effect (e.g. drop the column/table the bad
  migration added), not reverting to an old migration file. Do not
  hand-edit or delete files under `apps/api/prisma/migrations/` once they
  have run against production — that desyncs Prisma's migration history
  table from the filesystem.
- **Bad env var:** fix the value on the affected Railway service and
  redeploy (Railway does not roll env vars back automatically when you
  redeploy an old build).
