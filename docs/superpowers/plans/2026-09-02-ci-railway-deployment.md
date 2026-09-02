# CI + Railway Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Actions CI running the full gate suite, Docker images for the API and web apps, production hardening (health check, trust proxy, R2-compatible photo URLs, web Google sign-in), and a Railway rollout runbook.

**Architecture:** Dockerfiles per service built from the repo root (pnpm workspace); Railway auto-deploys `main` gated by CI. The API gains `GET /health`, `trust proxy`, and an `S3_PUBLIC_BASE_URL` override for R2's split write/read URLs. The web admin gains a Google Identity Services sign-in button that feeds the existing `POST /auth/google`.

**Tech Stack:** GitHub Actions, Docker (node:22-bookworm-slim), pnpm 10.15.0 + Turborepo, Nest.js 11, Next.js 16 standalone output, Google Identity Services, Cloudflare R2 (S3 API).

**Spec:** `docs/superpowers/specs/2026-09-02-deployment-ci-design.md`

## Global Constraints

- pnpm is pinned via root `package.json` `"packageManager": "pnpm@10.15.0"`; Docker and CI must use corepack, not a globally installed pnpm.
- Prisma stays pinned at exact `6.19.3`; never bump it in this work.
- Dev behavior must not change: MinIO photo URLs, dev email sign-in, and `AUTH_DEV_MODE` gating stay exactly as they are when the new env vars are unset.
- The e2e suite must stay green after every task: `pnpm --filter @macgrading/api test:e2e` (requires the dev compose stack: Postgres on 25432, MinIO on 9000).
- Env var names are load-bearing: `S3_PUBLIC_BASE_URL` (new), `THROTTLE_TTL_SECONDS`, `THROTTLE_LIMIT`, `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- Commit after each task; the executor merges to main only after the whole plan is green.

---

### Task 1: API health endpoint + trust proxy + postinstall prisma generate

**Files:**
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/test/health.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts` (add controller)
- Modify: `apps/api/src/main.ts` (trust proxy)
- Modify: `apps/api/package.json` (postinstall)

**Interfaces:**
- Consumes: `PrismaService` from `apps/api/src/prisma/prisma.service.ts` (the `PrismaModule` is `@Global()`, so the controller just injects it).
- Produces: `GET /health` → `200 {"status":"ok"}` — Task 4's Docker verification and the Railway healthcheck depend on this exact path and body.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/health.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok without auth', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @macgrading/api test:e2e -- health.e2e-spec`
Expected: FAIL with 404 (no /health route).

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Unauthenticated liveness probe for Railway's deploy healthcheck. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
```

In `apps/api/src/app.module.ts`, import it and add to the controllers array:

```typescript
import { HealthController } from './health/health.controller';
// ...
controllers: [AppController, HealthController],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @macgrading/api test:e2e -- health.e2e-spec`
Expected: PASS.

- [ ] **Step 5: Trust proxy in main.ts**

Replace the create call in `apps/api/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (process.env.NODE_ENV === 'production') {
    // Railway terminates TLS at its proxy; without this the throttler
    // keys every visitor on the proxy's IP (one shared rate bucket).
    app.set('trust proxy', 1);
  }
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

`@nestjs/platform-express` is already a dependency (Nest's default adapter) — the `import type` form matters (TS1272 decorator-metadata rule applies repo-wide).

- [ ] **Step 6: postinstall prisma generate**

In `apps/api/package.json` scripts, add:

```json
"postinstall": "prisma generate",
```

- [ ] **Step 7: Full gates + commit**

Run: `pnpm build && pnpm --filter @macgrading/api test && pnpm --filter @macgrading/api test:e2e`
Expected: all green (61 e2e tests now).

```bash
git add apps/api
git commit -m "feat(api): health endpoint, trust proxy, postinstall prisma generate"
```

---

### Task 2: S3_PUBLIC_BASE_URL photo URL override

**Files:**
- Modify: `apps/api/src/certs/certs.service.ts:28-35` (`publicUrlBase`)
- Modify: `apps/api/src/config/env.validation.ts:18` (replace `S3_PUBLIC_URL`)
- Create: `apps/api/test/photos-public-base.e2e-spec.ts`
- Modify: `.env.example:21-22`

**Interfaces:**
- Consumes: existing `publicUrlBase()` on `CertsService`, currently `${S3_PUBLIC_URL ?? S3_ENDPOINT}/${S3_BUCKET}`.
- Produces: new semantics — when `S3_PUBLIC_BASE_URL` is set, photo URLs are `${S3_PUBLIC_BASE_URL}/${objectKey}` **verbatim, no bucket segment** (R2's `pub-….r2.dev` URLs map to the bucket root). Unset → unchanged `${S3_ENDPOINT}/${S3_BUCKET}/${objectKey}`. The old optional `S3_PUBLIC_URL` (never set anywhere) is removed, not kept alongside.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/photos-public-base.e2e-spec.ts`. The env value must be set before the module compiles, and cleaned up afterward — jest runs suites in one process (`maxWorkers: 1`), so a leaked env var would poison the other photo assertions:

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

const PUBLIC_BASE = 'https://img.example.com';

describe('S3_PUBLIC_BASE_URL override', () => {
  let app: INestApplication;
  let token: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    process.env.S3_PUBLIC_BASE_URL = PUBLIC_BASE;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_TOKEN_VERIFIER)
      .useValue({
        verify: async (idToken: string) => ({
          email: idToken,
          googleId: `google-${idToken}`,
          name: 'Test',
        }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.S3_PUBLIC_BASE_URL;
    await app.close();
    await prisma.$disconnect();
  });

  it('serves photo URLs from the public base with no bucket segment', async () => {
    const mint = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardboardTensId: 'cbt-0001', isPrototype: false, variant: 'Holofoil' })
      .expect(201);
    const certNumber = mint.body.certNumber as string;

    const presign = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'image/jpeg' })
      .expect(201);
    const put = await fetch(presign.body.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    });
    expect(put.ok).toBe(true);
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ objectKey: presign.body.objectKey, sortOrder: 0 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/certs/${certNumber}`)
      .expect(200);
    const url = res.body.photos[0].url as string;
    expect(url.startsWith(`${PUBLIC_BASE}/`)).toBe(true);
    expect(url).not.toContain(process.env.S3_BUCKET!);
    expect(url).toContain(presign.body.objectKey);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @macgrading/api test:e2e -- photos-public-base`
Expected: FAIL — the URL still starts with the MinIO endpoint (unknown env vars are ignored by the current builder).

Note: if it instead fails at app boot with a config validation error, that confirms `forbidNonWhitelisted`-style strictness in `env.validation.ts` — proceed to Step 3, which adds the var to the schema.

- [ ] **Step 3: Implement**

In `apps/api/src/config/env.validation.ts`, replace line 18:

```typescript
  @IsOptional() @IsString() S3_PUBLIC_BASE_URL?: string;
```

(delete the `S3_PUBLIC_URL` line — it was never referenced by any deployment).

In `apps/api/src/certs/certs.service.ts`, replace `publicUrlBase`:

```typescript
  publicUrlBase(): string {
    // R2's public URLs (pub-….r2.dev or a custom domain) map straight to the
    // bucket root, so the override is used verbatim — no bucket segment.
    const publicBase = this.config.get<string>('S3_PUBLIC_BASE_URL');
    if (publicBase) {
      return publicBase.replace(/\/$/, '');
    }
    const base = this.config.getOrThrow<string>('S3_ENDPOINT');
    const bucket = this.config.getOrThrow<string>('S3_BUCKET');
    return `${base.replace(/\/$/, '')}/${bucket}`;
  }
```

In `.env.example`, replace the `S3_PUBLIC_URL` comment block (lines 21-22):

```
# Public read base for photos, used verbatim with no bucket segment
# (e.g. Cloudflare R2's https://pub-<hash>.r2.dev). Unset in dev: MinIO
# serves ${S3_ENDPOINT}/${S3_BUCKET} directly.
# S3_PUBLIC_BASE_URL=
```

- [ ] **Step 4: Run the full e2e suite**

Run: `pnpm --filter @macgrading/api test:e2e`
Expected: all suites PASS, including the pre-existing `certs-public` photo assertions (proving the env var cleanup in `afterAll` works and the fallback path is untouched).

- [ ] **Step 5: Commit**

```bash
git add apps/api .env.example
git commit -m "feat(api): S3_PUBLIC_BASE_URL override for R2 public photo URLs"
```

---

### Task 3: Web standalone output + Google admin sign-in

**Files:**
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/components/GoogleSignInButton.tsx`
- Modify: `apps/web/app/admin/layout.tsx:44-99` (sign-in screen)
- Modify: `.env.example` (web section)

**Interfaces:**
- Consumes: `adminFetch<LoginResponseDto>('/auth/google', { method: 'POST', body: { idToken } })` — exactly the call the dev email form already makes; a real Google credential goes through the same endpoint.
- Produces: `GoogleSignInButton({ onCredential: (idToken: string) => void })`, rendered only when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set. Task 4 bakes that var in as a Docker build arg.

- [ ] **Step 1: Standalone output**

Replace `apps/web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker runtime image; bundles
  // workspace deps (@macgrading/shared) so the image needs no node_modules.
  output: "standalone",
};

export default nextConfig;
```

Run: `pnpm --filter @macgrading/web build`
Expected: PASS, and `apps/web/.next/standalone/apps/web/server.js` exists (monorepo standalone nests by workspace path — Task 4's Dockerfile depends on this exact path; verify with `ls`).

- [ ] **Step 2: Google sign-in button component**

Create `apps/web/components/GoogleSignInButton.tsx`:

```tsx
'use client';

import Script from 'next/script';
import { useRef } from 'react';

interface GsiCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GsiCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme: string; size: string; width: number },
          ) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Renders Google's own sign-in button; hands the ID token to the caller. */
export function GoogleSignInButton({
  onCredential,
}: {
  onCredential: (idToken: string) => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  if (!CLIENT_ID) {
    return null;
  }
  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={() => {
          if (!window.google || !slotRef.current) return;
          window.google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: (response) => onCredential(response.credential),
          });
          window.google.accounts.id.renderButton(slotRef.current, {
            theme: 'outline',
            size: 'large',
            width: 320,
          });
        }}
      />
      <div ref={slotRef} className="flex justify-center" />
    </>
  );
}
```

- [ ] **Step 3: Wire it into the admin sign-in screen**

In `apps/web/app/admin/layout.tsx`:

Add the import:

```tsx
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
```

Add a shared credential handler next to the existing `signIn` (both paths converge on `/auth/google`):

```tsx
  const signInWithToken = async (idToken: string) => {
    setError(null);
    try {
      const result = await adminFetch<LoginResponseDto>('/auth/google', {
        method: 'POST',
        body: { idToken },
      });
      setAdminToken(result.accessToken);
      setUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    await signInWithToken(email.trim());
  };
```

Replace the signed-out screen's body (the form + disabled Google button block). The Google button renders when configured; the dev email form appears only when it is not — production never shows a dead dev form:

```tsx
        <h1 className="text-2xl font-bold text-neutral-900">MAC Grading Admin</h1>
        <GoogleSignInButton onCredential={(idToken) => void signInWithToken(idToken)} />
        {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <>
            <form onSubmit={signIn} className="flex flex-col gap-3">
              <input
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2"
                placeholder="you@macgrading.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-label="Email for dev sign-in"
              />
              <button
                type="submit"
                className="rounded-lg bg-neutral-700 px-4 py-2 font-semibold text-white hover:bg-neutral-800"
              >
                Dev sign-in
              </button>
            </form>
            <p className="text-xs text-neutral-400">
              Dev sign-in requires AUTH_DEV_MODE on the API. Set
              NEXT_PUBLIC_GOOGLE_CLIENT_ID to use Google sign-in.
            </p>
          </>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
```

Also update the layout's doc comment (lines 13-17) to say the Google button activates via `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

- [ ] **Step 4: Update .env.example**

In the web section of `.env.example`, after `NEXT_PUBLIC_SITE_URL`:

```
# Google OAuth web client ID — enables the admin Google sign-in button
# (dev email sign-in shows when unset). Must also be the API's GOOGLE_CLIENT_ID.
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

- [ ] **Step 5: Gates + commit**

Run: `pnpm --filter @macgrading/web typecheck && pnpm --filter @macgrading/web test && pnpm --filter @macgrading/web build`
Expected: all PASS. (The GIS button itself is untestable off-origin; it is verified in the production smoke test per the spec. Dev-mode behavior — email form present, no Google button — is preserved because the env var is unset locally.)

```bash
git add apps/web .env.example
git commit -m "feat(web): Google admin sign-in and standalone output"
```

---

### Task 4: Dockerfiles + .dockerignore + local build verification

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: Task 1's `GET /health`; Task 3's standalone output at `.next/standalone/apps/web/server.js`; root `packageManager: pnpm@10.15.0`; `postinstall: prisma generate` (which requires the prisma schema to be COPYed **before** `pnpm install`).
- Produces: images runnable as `node dist/main` (api, port from `PORT`) and `node apps/web/server.js` (web, port 3000). Task 6's runbook references both build commands verbatim.

- [ ] **Step 1: Root .dockerignore**

Create `.dockerignore`:

```
node_modules
**/node_modules
.git
**/.next
**/dist
**/.expo
apps/mobile
.claude
.remember
.superpowers
docs
.env
**/.env
*.log
```

- [ ] **Step 2: API Dockerfile**

Create `apps/api/Dockerfile` (build context is the REPO ROOT):

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
# openssl: required by Prisma's query engine on slim images
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
# postinstall runs `prisma generate`, so the schema must exist pre-install
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @macgrading/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm exec turbo build --filter=@macgrading/api

FROM node:22-bookworm-slim AS run
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
ENV NODE_ENV=production
WORKDIR /app
# Whole workspace, dev deps included: the prisma CLI must be present for
# Railway's pre-deploy `prisma migrate deploy`. Slimming is a later concern.
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main"]
```

- [ ] **Step 3: Web Dockerfile**

Create `apps/web/Dockerfile` (build context is the REPO ROOT):

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @macgrading/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
# NEXT_PUBLIC_* are inlined into the client bundle at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
RUN pnpm exec turbo build --filter=@macgrading/web

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
```

(No `public/` copy — `apps/web` has no public directory.)

- [ ] **Step 4: Build both images locally**

Run from the repo root:

```bash
docker build -f apps/api/Dockerfile -t macgrading-api:local .
docker build -f apps/web/Dockerfile -t macgrading-web:local \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
  --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000 .
```

Expected: both succeed. If the standalone path in the web runtime stage is wrong, the COPY fails loudly — fix against what `ls apps/web/.next/standalone` shows.

- [ ] **Step 5: Boot the API image against the dev compose stack**

The dev stack's ports bind to 127.0.0.1, so join the compose network and use service names (network `macgrading_default`, service `postgres`, credentials macgrading/macgrading):

```bash
docker run --rm -d --name api-smoke --network macgrading_default -p 3999:3001 \
  -e DATABASE_URL=postgresql://macgrading:macgrading@postgres:5432/macgrading \
  -e JWT_SECRET=smoke -e GOOGLE_CLIENT_ID=smoke \
  -e S3_ENDPOINT=http://minio:9000 -e S3_ACCESS_KEY=macgrading \
  -e S3_SECRET_KEY=macgrading -e S3_BUCKET=slab-photos -e S3_REGION=us-east-1 \
  -e CORS_ORIGIN=http://localhost:3000 \
  macgrading-api:local
sleep 3 && curl -s http://localhost:3999/health
docker rm -f api-smoke
```

Expected: `{"status":"ok"}`. Also boot the web image (`docker run --rm -d --name web-smoke -p 3998:3000 macgrading-web:local`, curl `http://localhost:3998` for a 200, then `docker rm -f web-smoke`).

- [ ] **Step 6: Commit**

```bash
git add .dockerignore apps/api/Dockerfile apps/web/Dockerfile
git commit -m "feat: production Dockerfiles for api and web"
```

---

### Task 5: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the e2e suite's env contract — `resolveDbUrls()` derives `<db>_test` from `DATABASE_URL` and the global setup creates that database and runs `prisma migrate deploy`; `env-setup.ts` forces `CARDBOARDTENS_API_KEY=''` (stub catalog) and a high `THROTTLE_LIMIT` itself. `env.validation.ts` requires: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`.
- Produces: a required check named `gates` — Task 6's runbook enables Railway "wait for CI" against it.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`. MinIO runs as a `docker run` step, not a service container (GitHub services cannot pass the `server /data` command). Image tags are the same pinned releases as docker-compose.yml:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  gates:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: macgrading
          POSTGRES_PASSWORD: macgrading
          POSTGRES_DB: macgrading
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U macgrading"
          --health-interval 5s --health-timeout 3s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - name: Start MinIO
        run: |
          docker run -d --name minio -p 9000:9000 \
            -e MINIO_ROOT_USER=macgrading -e MINIO_ROOT_PASSWORD=macgrading \
            minio/minio:RELEASE.2025-09-07T16-13-09Z server /data
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Enable pnpm via corepack
        run: corepack enable
      - name: Get pnpm store path
        id: pnpm-store
        run: echo "path=$(pnpm store path)" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-store.outputs.path }}
          key: pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: pnpm-${{ runner.os }}-
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Build
        run: pnpm build
      - name: Unit tests
        run: pnpm test
      - name: Typecheck web
        run: pnpm --filter @macgrading/web typecheck
      - name: Typecheck mobile
        run: pnpm --filter @macgrading/mobile exec tsc --noEmit
      - name: Create MinIO bucket
        run: |
          docker run --rm --network host \
            --entrypoint sh minio/mc:RELEASE.2025-08-13T08-35-41Z -c \
            "mc alias set local http://localhost:9000 macgrading macgrading \
             && mc mb --ignore-existing local/slab-photos \
             && mc anonymous set download local/slab-photos"
      - name: API e2e
        # env is step-scoped: NODE_ENV=test must not leak into next build
        # or the unit-test steps above
        env:
          DATABASE_URL: postgresql://macgrading:macgrading@localhost:5432/macgrading
          JWT_SECRET: ci-secret
          GOOGLE_CLIENT_ID: ci-client-id
          AUTH_DEV_MODE: 'true'
          NODE_ENV: test
          S3_ENDPOINT: http://localhost:9000
          S3_ACCESS_KEY: macgrading
          S3_SECRET_KEY: macgrading
          S3_BUCKET: slab-photos
          S3_REGION: us-east-1
        run: pnpm --filter @macgrading/api test:e2e
```

Note for the implementer: `resolveDbUrls()` calls `dotenv.config` on `apps/api/.env`, which does not exist in CI — dotenv tolerates a missing file and falls through to `process.env.DATABASE_URL`, which the job env provides. Do not create a .env file in CI.

- [ ] **Step 2: Validate the workflow syntax locally**

Run: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color` (or `pnpm dlx @action-validator/cli .github/workflows/ci.yml` if Docker is busy; if neither tool works offline, a YAML parse via `node -e "require('js-yaml')..."` is NOT sufficient — flag it in the report and rely on the PR run).
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: full gate suite on GitHub Actions"
```

The workflow proves itself when the branch is pushed (rollout step 2 in the spec); the executor should watch the first run with `gh run watch` after the merge lands.

---

### Task 6: Railway rollout runbook

**Files:**
- Create: `docs/deploy/railway-runbook.md`
- Modify: `.env.example` (production notes header on the API section)

**Interfaces:**
- Consumes: everything above — exact env var names from Tasks 1-4, the `gates` check from Task 5, the spec's production env table.
- Produces: the operator script for the interactive rollout session (executed by the controller with the human via the Railway MCP, not by a subagent).

- [ ] **Step 1: Write the runbook**

Create `docs/deploy/railway-runbook.md` with these sections, concrete values throughout (copy the production env table from the spec `docs/superpowers/specs/2026-09-02-deployment-ci-design.md` verbatim, it is already exact):

1. **Prereqs (human):** Cloudflare account → R2 → create bucket `macgrading-photos` → Settings → enable public dev URL (record `https://pub-<hash>.r2.dev`) → R2 API token (Object Read & Write, scoped to the bucket; record access key ID, secret, and the S3 endpoint `https://<account-id>.r2.cloudflarestorage.com`). GCP console → OAuth client, type **Web application**, authorized JavaScript origin `https://macgrading.com` (record client ID). Generate `JWT_SECRET` via `openssl rand -hex 32`.
2. **Railway (via MCP):** create project `macgrading`; add Postgres; add service `api` from the GitHub repo (root directory `/`, Dockerfile path `apps/api/Dockerfile`), pre-deploy command `pnpm exec prisma migrate deploy` with working directory `apps/api` (or `cd apps/api && pnpm exec prisma migrate deploy` if the field has no cwd), healthcheck path `/health`, watch paths `apps/api/**`, `packages/shared/**`; add service `web` (Dockerfile `apps/web/Dockerfile`), watch paths `apps/web/**`, `packages/shared/**`, `NEXT_PUBLIC_*` set as build-time variables; set all env vars per the table; `DATABASE_URL` as a reference to the Postgres service.
3. **Domains:** Railway custom domains `api.macgrading.com` (api) and `macgrading.com` + `www.macgrading.com` (web); the DNS records each one prints. Namecheap path: ALIAS on `@`, CNAME on `www` and `api`. Cloudflare path (recommended): move the zone first, then CNAME all three (DNS-only/grey cloud to start), and later attach `img.macgrading.com` to the R2 bucket and flip `S3_PUBLIC_BASE_URL`.
4. **Wait for CI:** enable "Wait for CI" on both services against the `gates` check.
5. **Smoke test:** `curl https://api.macgrading.com/health` → `{"status":"ok"}`; open `https://macgrading.com/cert/<a real cert number>`; admin Google sign-in at `/admin` (the signer's email must be an ADMIN user row — insert via Railway's Postgres shell if the table is empty: exact SQL `INSERT INTO "User" (id, email, name, role, "isActive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'ryanbarr@gmail.com', 'Ryan', 'ADMIN', true, now(), now());`); mint nothing yet — photo upload smoke waits for item 4's mobile build, but verify presign returns an `r2.cloudflarestorage.com` URL via the admin JWT and `curl -X POST .../photos/presign`.
6. **Rollback:** Railway's deployment history → redeploy previous build; DB migrations are forward-only (no down migrations exist), so schema rollbacks mean a new forward migration.

- [ ] **Step 2: .env.example production note**

At the top of the API section of `.env.example`, add a pointer comment:

```
# Production values and the Railway rollout procedure live in
# docs/deploy/railway-runbook.md.
```

- [ ] **Step 3: Commit**

```bash
git add docs/deploy/railway-runbook.md .env.example
git commit -m "docs: Railway rollout runbook"
```
