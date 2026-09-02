# CI + Railway Deployment Design

**Date:** 2026-09-02
**Scope:** Item 3 of the post-polish roadmap — GitHub Actions CI and production
deployment of the API and web apps to Railway under macgrading.com. Mobile
distribution (item 4) is a separate follow-up project.

## Goals

- Every push to `main` (and every PR) runs the full gate suite in GitHub
  Actions: build, unit tests, web + mobile typecheck, and the API e2e suite
  against real Postgres and MinIO containers.
- `main` auto-deploys to Railway, but only after CI is green (Railway
  "wait for CI").
- Web serves `https://macgrading.com` (+ `www`), API serves
  `https://api.macgrading.com`, slab photos live in Cloudflare R2.
- A deployed admin section that is actually usable: real Google sign-in on
  the web, since the dev email sign-in is hard-blocked outside
  `NODE_ENV=development/test`.

## Non-goals

- Mobile distribution, TestFlight, and mobile Google OAuth (item 4).
- Staging environments, preview deploys, IaC. One production environment.
- Observability beyond Railway's built-in logs/metrics.

## Deployment topology

One Railway project **macgrading**, three services:

| Service | Source | Domain | Notes |
|---|---|---|---|
| postgres | Railway managed Postgres | (private) | `DATABASE_URL` consumed by api over the private network |
| api | `apps/api/Dockerfile`, repo-root build context | api.macgrading.com | Pre-deploy command: `prisma migrate deploy`. Healthcheck: `GET /health`. Watch paths: `apps/api/**`, `packages/shared/**` |
| web | `apps/web/Dockerfile`, repo-root build context | macgrading.com, www.macgrading.com | Next.js standalone output. `NEXT_PUBLIC_*` passed as Docker build args. Watch paths: `apps/web/**`, `packages/shared/**` |

Build strategy is **Dockerfiles per service** (approach A): deterministic,
locally testable with `docker build`, immune to buildpack guessing about pnpm
workspaces. Railway's GitHub integration auto-deploys `main`; watch paths keep
an API-only commit from rebuilding the web and vice versa.

### Photos: Cloudflare R2

- Bucket `macgrading-photos`, accessed through R2's S3-compatible API.
- The API presigns PUTs against `https://<account-id>.r2.cloudflarestorage.com`
  using an R2 API token (access key + secret, scoped to the bucket).
- Public reads use the bucket's `pub-<hash>.r2.dev` URL initially. Once the
  DNS zone moves to Cloudflare, upgrade to `img.macgrading.com` (R2 custom
  domains require the zone on Cloudflare) — a config change only.
- The user creates the bucket and token in the Cloudflare dashboard; exact
  steps live in the runbook.

### DNS

DNS is currently on Namecheap. The runbook covers both paths:

- **Namecheap:** ALIAS record on the apex → Railway's web CNAME target,
  CNAME for `www` and `api`.
- **Cloudflare (recommended):** move the zone; CNAME (flattened at apex) for
  all three. Required later for `img.macgrading.com`.

## Code changes

### Dockerfiles

- `apps/api/Dockerfile` and `apps/web/Dockerfile`, both built from the repo
  root so `packages/shared` resolves. Multi-stage: `pnpm install` (frozen
  lockfile) → `turbo build` scoped to the service → slim `node:22` runtime
  stage with only production deps and build output.
- API image runs `prisma generate` at build; web uses Next.js
  `output: 'standalone'` (new setting in `next.config.ts`).
- Root `.dockerignore` (node_modules, .git, .next, dist, .claude, .remember,
  docs).

### API hardening

- **Trust proxy:** `app.set('trust proxy', 1)` when `NODE_ENV=production`,
  so the throttler keys on real client IPs behind Railway's proxy.
- **`GET /health`:** unauthenticated, no throttle exemption needed; runs
  `SELECT 1` through Prisma and returns `{ status: 'ok' }`. Railway's
  healthcheck gates each deploy on it.
- **Photo URL split:** new optional env `S3_PUBLIC_BASE_URL`. When set, the
  public photo URL builder uses `${S3_PUBLIC_BASE_URL}/${objectKey}`;
  otherwise it falls back to the existing `${S3_ENDPOINT}/${S3_BUCKET}/…`
  behavior, leaving dev/MinIO untouched.
- **`postinstall: prisma generate`** in `apps/api/package.json`, eliminating
  the stale-generated-client failure mode seen after the polish-batch merge.

### Web admin Google sign-in

- Google Identity Services (GIS) button on the `/admin` sign-in screen. The
  GIS callback posts the returned ID token to the existing
  `POST /auth/google`; the rest of the admin auth flow (JWT in
  localStorage) is unchanged.
- Rendered when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set; the dev email form
  remains the fallback when it is not (local dev unchanged).
- One Google OAuth **web** client created in the GCP console with authorized
  JavaScript origin `https://macgrading.com`. The API's Google token
  verifier accepts that client ID as an audience.

### Production environment values

| Var | Service | Value |
|---|---|---|
| `DATABASE_URL` | api | Railway Postgres reference |
| `NODE_ENV` | api | `production` (`AUTH_DEV_MODE` unset) |
| `CORS_ORIGIN` | api | `https://macgrading.com` |
| `THROTTLE_TTL_SECONDS` / `THROTTLE_LIMIT` | api | 60 / 100 (public lookup is cache-friendly; revisit if abused) |
| `JWT_SECRET` | api | fresh 256-bit random |
| `GOOGLE_CLIENT_ID` | api | the web OAuth client ID (widens to a multi-audience list in item 4 when mobile client IDs arrive) |
| `CARDBOARDTENS_API_KEY` / `CARDBOARDTENS_API_URL` | api | real values |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | api | R2 endpoint + token, `macgrading-photos` |
| `S3_PUBLIC_BASE_URL` | api | the bucket's `pub-….r2.dev` URL |
| `NEXT_PUBLIC_API_URL` | web (build arg) | `https://api.macgrading.com` |
| `NEXT_PUBLIC_SITE_URL` | web (build arg) | `https://macgrading.com` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | web (build arg) | the web OAuth client ID |

## CI

`.github/workflows/ci.yml`, triggered on PRs and pushes to `main`:

1. Checkout, pnpm via corepack, Node 22, pnpm store cache.
2. `pnpm install --frozen-lockfile`.
3. `pnpm build` (turbo: shared, api, web).
4. `pnpm test` (unit: shared, api, web, mobile).
5. Typechecks: `tsc --noEmit` for web and mobile.
6. API e2e: **Postgres 16** and **MinIO** service containers (the suite
   exercises real presigned uploads). Job env mirrors local test config:
   `AUTH_DEV_MODE=true`, `NODE_ENV=test`, `CARDBOARDTENS_API_KEY=""`
   (stub catalog), `DATABASE_URL` → service container, MinIO S3 vars.
   `prisma migrate deploy` runs before jest, matching the local pretest.

Single job, sequential steps (the suite is ~5 min total; parallel jobs are
not worth the cache duplication yet). After the workflow is proven green,
enable Railway's **"wait for CI"** on both services so a red commit never
deploys.

## Rollout order

1. Land code changes (Dockerfiles, health, trust proxy, URL split, GIS
   button, postinstall) through the normal gate suite. Verify both images
   locally with `docker build`.
2. Push the CI workflow; prove it green on GitHub.
3. User authenticates the Railway MCP; user creates the R2 bucket + API
   token and the Google web OAuth client (runbook steps) and hands over
   values.
4. Create Railway project/services via MCP, set env, connect the GitHub
   repo, configure domains, pre-deploy command, healthchecks, watch paths,
   wait-for-CI.
5. DNS records at Namecheap (or move zone to Cloudflare first).
6. Smoke test: `GET /health`, cert lookup on macgrading.com, admin Google
   sign-in, presigned photo upload against R2 end-to-end.

## Testing

- CI proves itself on a PR before anything deploys.
- Docker images build and boot locally (api against the dev compose stack).
- Existing e2e suite is the regression net for the API changes; the photo
  URL split gets an e2e assertion (`S3_PUBLIC_BASE_URL` set → URLs use it).
- The GIS button is verified in production smoke (it cannot run against
  localhost without an authorized origin; dev keeps the email form).

## Risks

- **R2 presign compatibility:** R2's S3 API needs `region: 'auto'` and path
  addressing quirks; mitigated by keeping the presign code on the AWS SDK
  and smoke-testing a real upload before calling it done.
- **NEXT_PUBLIC at build time:** wrong build args produce a web image
  pointing at the wrong API; mitigated by baking values into the Railway
  service config once and documenting them in `.env.example`.
- **Apex DNS on Namecheap:** ALIAS support varies by DNS product; if the
  apex record misbehaves, moving the zone to Cloudflare is the fix and is
  already the recommended path.
