# MAC Grading Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the MAC Grading monorepo: pnpm + Turborepo workspace, local Postgres + MinIO via docker-compose, a tested `@macgrading/shared` package with cert-number utilities and domain types, and a minimal Nest.js API with the full Prisma schema migrated and seeded.

**Architecture:** Turborepo monorepo (`apps/*`, `packages/*`). `packages/shared` compiles to CJS in `dist/` and is consumed by all apps. `apps/api` (Nest.js) owns Prisma and the database. Postgres and MinIO run locally in docker-compose; MinIO mirrors the S3-compatible Railway bucket used in prod.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript (strict), Vitest (shared package), Nest.js + Jest (API), Prisma + PostgreSQL, MinIO.

**Spec:** `docs/superpowers/specs/2026-08-31-mac-grading-design.md`

## Global Constraints

- Cert numbers: exactly nine digits with leading zeroes; prototype certs prefixed with a single `P` (`000000001`, `P000000001`). Two independent sequences.
- Grade values are decimals end-to-end (`Decimal` in Postgres, string in JSON DTOs); UI may restrict to whole numbers but storage/transport must not.
- Seeded grade names: `1 → "Lil' Mac"`, `10 → "Mac Daddy"`. Names for 2–9 arrive later; absence of a name must be legal.
- Package names are scoped `@macgrading/*` (`@macgrading/shared`, `@macgrading/api`).
- Node >= 22, pnpm >= 10. TypeScript `strict: true` everywhere.
- All database access goes through Prisma in `apps/api`. No other workspace may depend on `@prisma/client`.
- Commit after every green test cycle (each task's final step).

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: workspace layout (`apps/*`, `packages/*`), root scripts `pnpm build` / `pnpm test` / `pnpm lint` (via turbo), and `tsconfig.base.json` that later tasks extend.

- [ ] **Step 1: Write root config files**

`package.json`:

```json
{
  "name": "macgrading",
  "private": true,
  "packageManager": "pnpm@10.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.9.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json`:

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
.next/
.expo/
.turbo/
coverage/
.env
*.tsbuildinfo
.DS_Store
```

`.nvmrc`:

```
22
```

`README.md`:

```markdown
# MAC Grading

Mostly Accurate Certifications — meme card grading.

- `apps/api` — Nest.js API (public cert lookup + team operations)
- `apps/web` — Next.js public site (added in Phase 4)
- `apps/mobile` — Expo team app (added in Phase 3)
- `packages/shared` — cert-number utilities, shared types

## Setup

    pnpm install
    docker compose up -d
    pnpm build && pnpm test

Spec: `docs/superpowers/specs/2026-08-31-mac-grading-design.md`
```

- [ ] **Step 2: Create workspace directories and install**

Run: `mkdir -p apps packages && pnpm install`
Expected: lockfile created, turbo + typescript installed, no errors.

- [ ] **Step 3: Verify turbo runs (vacuously)**

Run: `pnpm build`
Expected: turbo reports no packages with a `build` task and exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

### Task 2: Local infrastructure (Postgres + MinIO)

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: Postgres at `localhost:5432` (db/user/password `macgrading`), MinIO S3 API at `localhost:9000` (console `:9001`), bucket `slab-photos` pre-created. `DATABASE_URL` convention used by Task 5.

- [ ] **Step 1: Write docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: macgrading
      POSTGRES_PASSWORD: macgrading
      POSTGRES_DB: macgrading
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U macgrading"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: macgrading
      MINIO_ROOT_PASSWORD: macgrading
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 macgrading macgrading &&
      mc mb --ignore-existing local/slab-photos
      "

volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 2: Write .env.example**

```
# Postgres (docker-compose defaults)
DATABASE_URL=postgresql://macgrading:macgrading@localhost:5432/macgrading

# S3-compatible storage (MinIO locally, Railway bucket in prod)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=macgrading
S3_SECRET_KEY=macgrading
S3_BUCKET=slab-photos
S3_REGION=us-east-1
```

- [ ] **Step 3: Verify the stack comes up**

Run: `docker compose up -d --wait`
Expected: exits 0 with postgres and minio healthy (`--wait` blocks on healthchecks; minio-init exits 0 after creating the bucket).

Run: `docker compose exec postgres pg_isready -U macgrading`
Expected: `accepting connections`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker-compose with postgres and minio"
```

---

### Task 3: `@macgrading/shared` package scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` from Task 1.
- Produces: importable workspace package `@macgrading/shared` (CJS build in `dist/`, entry `dist/index.js`, types `dist/index.d.ts`) with working `build` and `test` scripts. Tasks 4–5 add exports to `src/index.ts`.

- [ ] **Step 1: Write package files**

`packages/shared/package.json`:

```json
{
  "name": "@macgrading/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

`packages/shared/src/index.ts`:

```ts
export const SHARED_PACKAGE_NAME = '@macgrading/shared';
```

`packages/shared/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from './index';

describe('package smoke test', () => {
  it('exports the package name', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@macgrading/shared');
  });
});
```

- [ ] **Step 2: Install and run the smoke test**

Run: `pnpm install && pnpm --filter @macgrading/shared test`
Expected: 1 test passes.

- [ ] **Step 3: Verify the build produces dist output**

Run: `pnpm --filter @macgrading/shared build && ls packages/shared/dist`
Expected: `index.js`, `index.d.ts` present. Test files are excluded from `dist/` (tsconfig excludes `*.test.ts`).

- [ ] **Step 4: Verify turbo sees the package**

Run: `pnpm test`
Expected: turbo runs `@macgrading/shared#test` (after `build` per pipeline), passes.

- [ ] **Step 5: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat: scaffold @macgrading/shared package with vitest"
```

---

### Task 4: Cert-number utilities (TDD)

**Files:**
- Create: `packages/shared/src/cert-number.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/cert-number.test.ts`

**Interfaces:**
- Consumes: Task 3's package scaffold.
- Produces (used by API minting in Phase 2, web search-box routing in Phase 4, mobile display in Phase 3):
  - `CERT_NUMBER_DIGITS: 9`
  - `MAX_CERT_SEQUENCE: 999_999_999`
  - `CERT_NUMBER_REGEX: RegExp` — matches a full cert number string
  - `formatCertNumber(sequenceValue: number, isPrototype: boolean): string`
  - `parseCertNumber(input: string): { sequenceValue: number; isPrototype: boolean } | null`
  - `isValidCertNumber(input: string): boolean`

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/cert-number.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CERT_NUMBER_REGEX,
  formatCertNumber,
  isValidCertNumber,
  parseCertNumber,
} from './cert-number';

describe('formatCertNumber', () => {
  it('pads standard numbers to nine digits', () => {
    expect(formatCertNumber(1, false)).toBe('000000001');
    expect(formatCertNumber(42, false)).toBe('000000042');
    expect(formatCertNumber(999_999_999, false)).toBe('999999999');
  });

  it('prefixes prototype numbers with P', () => {
    expect(formatCertNumber(1, true)).toBe('P000000001');
    expect(formatCertNumber(123_456_789, true)).toBe('P123456789');
  });

  it('rejects out-of-range or non-integer sequence values', () => {
    expect(() => formatCertNumber(0, false)).toThrow(RangeError);
    expect(() => formatCertNumber(-5, false)).toThrow(RangeError);
    expect(() => formatCertNumber(1_000_000_000, false)).toThrow(RangeError);
    expect(() => formatCertNumber(1.5, false)).toThrow(RangeError);
    expect(() => formatCertNumber(Number.NaN, false)).toThrow(RangeError);
  });
});

describe('parseCertNumber', () => {
  it('parses standard cert numbers', () => {
    expect(parseCertNumber('000000001')).toEqual({
      sequenceValue: 1,
      isPrototype: false,
    });
  });

  it('parses prototype cert numbers', () => {
    expect(parseCertNumber('P000000042')).toEqual({
      sequenceValue: 42,
      isPrototype: true,
    });
  });

  it('returns null for invalid input', () => {
    expect(parseCertNumber('')).toBeNull();
    expect(parseCertNumber('12345678')).toBeNull(); // 8 digits
    expect(parseCertNumber('1234567890')).toBeNull(); // 10 digits
    expect(parseCertNumber('p000000001')).toBeNull(); // lowercase p
    expect(parseCertNumber('PP00000001')).toBeNull();
    expect(parseCertNumber('00000000a')).toBeNull();
    expect(parseCertNumber(' 000000001')).toBeNull();
    expect(parseCertNumber('000000000')).toBeNull(); // sequence starts at 1
    expect(parseCertNumber('P000000000')).toBeNull();
  });
});

describe('isValidCertNumber', () => {
  it('accepts valid numbers and rejects invalid ones', () => {
    expect(isValidCertNumber('000000001')).toBe(true);
    expect(isValidCertNumber('P999999999')).toBe(true);
    expect(isValidCertNumber('000000000')).toBe(false);
    expect(isValidCertNumber('nonsense')).toBe(false);
  });
});

describe('CERT_NUMBER_REGEX', () => {
  it('matches full strings only', () => {
    expect(CERT_NUMBER_REGEX.test('000000001')).toBe(true);
    expect(CERT_NUMBER_REGEX.test('P000000001')).toBe(true);
    expect(CERT_NUMBER_REGEX.test('x000000001x')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @macgrading/shared test`
Expected: FAIL — cannot resolve `./cert-number`.

- [ ] **Step 3: Implement**

`packages/shared/src/cert-number.ts`:

```ts
export const CERT_NUMBER_DIGITS = 9;
export const MAX_CERT_SEQUENCE = 999_999_999;

/** Matches a complete cert number: nine digits, optional single P prefix. */
export const CERT_NUMBER_REGEX = /^P?\d{9}$/;

export interface ParsedCertNumber {
  sequenceValue: number;
  isPrototype: boolean;
}

export function formatCertNumber(
  sequenceValue: number,
  isPrototype: boolean,
): string {
  if (
    !Number.isInteger(sequenceValue) ||
    sequenceValue < 1 ||
    sequenceValue > MAX_CERT_SEQUENCE
  ) {
    throw new RangeError(
      `cert sequence value must be an integer in [1, ${MAX_CERT_SEQUENCE}], got ${sequenceValue}`,
    );
  }
  const digits = String(sequenceValue).padStart(CERT_NUMBER_DIGITS, '0');
  return isPrototype ? `P${digits}` : digits;
}

export function parseCertNumber(input: string): ParsedCertNumber | null {
  if (!CERT_NUMBER_REGEX.test(input)) {
    return null;
  }
  const isPrototype = input.startsWith('P');
  const sequenceValue = Number(isPrototype ? input.slice(1) : input);
  if (sequenceValue < 1) {
    return null;
  }
  return { sequenceValue, isPrototype };
}

export function isValidCertNumber(input: string): boolean {
  return parseCertNumber(input) !== null;
}
```

Update `packages/shared/src/index.ts`:

```ts
export * from './cert-number';

export const SHARED_PACKAGE_NAME = '@macgrading/shared';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @macgrading/shared test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat: cert number format/parse/validate utilities"
```

---

### Task 5: Shared domain types and constants

**Files:**
- Create: `packages/shared/src/domain.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/domain.test.ts`

**Interfaces:**
- Consumes: Task 3's scaffold.
- Produces (the JSON wire shapes for all later phases — API responses serialize to these; web/mobile consume them):
  - `Role`, `CertStatus`, `CertCounterType` string-literal union types + value arrays
  - `CardSummary`, `CertDto`, `CertPhotoDto`, `GradeNameDto` interfaces
  - Note: `grade` and `gradeValue` are **strings** on the wire (Prisma `Decimal` must not travel as a float).

- [ ] **Step 1: Write the failing test**

`packages/shared/src/domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CERT_STATUSES, CERT_COUNTER_TYPES, ROLES } from './domain';
import type { CertDto } from './domain';

describe('domain constants', () => {
  it('enumerates the spec values', () => {
    expect(ROLES).toEqual(['ADMIN', 'TEAM_MEMBER']);
    expect(CERT_STATUSES).toEqual(['PENDING_GRADE', 'GRADED']);
    expect(CERT_COUNTER_TYPES).toEqual(['STANDARD', 'PROTOTYPE']);
  });

  it('CertDto carries decimal grades as strings', () => {
    // Type-level check: this must compile with grade as string | null.
    const cert: CertDto = {
      certNumber: 'P000000001',
      isPrototype: true,
      status: 'GRADED',
      cardboardTensId: 'cbt_123',
      cardName: 'Charizard',
      setName: 'Base Set',
      cardNumber: '4/102',
      releaseYear: 1999,
      category: 'Pokemon',
      cardImageUrl: null,
      grade: '10',
      gradeName: 'Mac Daddy',
      gradedAt: '2026-08-31T17:00:00.000Z',
      createdAt: '2026-08-31T16:00:00.000Z',
      photos: [],
    };
    expect(cert.grade).toBe('10');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @macgrading/shared test`
Expected: FAIL — cannot resolve `./domain`.

- [ ] **Step 3: Implement**

`packages/shared/src/domain.ts`:

```ts
export const ROLES = ['ADMIN', 'TEAM_MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const CERT_STATUSES = ['PENDING_GRADE', 'GRADED'] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

export const CERT_COUNTER_TYPES = ['STANDARD', 'PROTOTYPE'] as const;
export type CertCounterType = (typeof CERT_COUNTER_TYPES)[number];

/** A card as returned by the card catalog (CardboardTens stub for now). */
export interface CardSummary {
  cardboardTensId: string;
  cardName: string;
  setName: string;
  cardNumber: string | null;
  releaseYear: number | null;
  category: string | null;
  cardImageUrl: string | null;
}

export interface CertPhotoDto {
  id: string;
  url: string;
  sortOrder: number;
}

/**
 * The public wire shape of a certification. Dates are ISO-8601 strings;
 * decimal grades travel as strings, never floats.
 */
export interface CertDto {
  certNumber: string;
  isPrototype: boolean;
  status: CertStatus;
  cardboardTensId: string;
  cardName: string;
  setName: string;
  cardNumber: string | null;
  releaseYear: number | null;
  category: string | null;
  cardImageUrl: string | null;
  grade: string | null;
  gradeName: string | null;
  gradedAt: string | null;
  createdAt: string;
  photos: CertPhotoDto[];
}

export interface GradeNameDto {
  gradeValue: string;
  name: string;
}
```

Update `packages/shared/src/index.ts`:

```ts
export * from './cert-number';
export * from './domain';

export const SHARED_PACKAGE_NAME = '@macgrading/shared';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @macgrading/shared test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat: shared domain types and wire DTOs"
```

---

### Task 6: Nest.js API scaffold with health endpoint

**Files:**
- Create: `apps/api/` (via Nest CLI, then adjusted)
- Modify: `apps/api/package.json`
- Modify: `apps/api/tsconfig.json`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: workspace from Task 1, `@macgrading/shared` from Task 3.
- Produces: `@macgrading/api` Nest app with `GET /health` → `{ status: 'ok' }`, runnable via `pnpm --filter @macgrading/api dev`, tested via `pnpm --filter @macgrading/api test:e2e`. `AppModule` at `apps/api/src/app.module.ts` is where Phase 2 modules register.

- [ ] **Step 1: Generate the Nest app**

Run: `pnpm dlx @nestjs/cli@latest new api --directory apps/api --package-manager pnpm --skip-git --skip-install`
Expected: `apps/api` created with `src/`, `test/`, configs.

- [ ] **Step 2: Adjust package.json for the workspace**

Edit `apps/api/package.json`: set `"name": "@macgrading/api"`, `"private": true`, and add the shared dependency and a `dev` script alias. Keep Nest's generated scripts and dependencies; ensure these entries exist:

```json
{
  "name": "@macgrading/api",
  "private": true,
  "scripts": {
    "dev": "nest start --watch"
  },
  "dependencies": {
    "@macgrading/shared": "workspace:*"
  }
}
```

(Merge into the generated file — do not delete Nest's existing scripts/deps. The generated `build`, `test`, `test:e2e` scripts are used by turbo as-is.)

- [ ] **Step 3: Replace the generated hello-world with a health endpoint**

Delete `apps/api/src/app.controller.spec.ts`, `apps/api/src/app.service.ts`.

`apps/api/src/app.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 4: Write the failing e2e test**

Replace `apps/api/test/app.e2e-spec.ts` with `apps/api/test/health.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('GET /health', () => {
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

  it('returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
```

(If the generated e2e setup imports supertest as `* as request`, match the generated style.)

- [ ] **Step 5: Install and verify shared import works**

Run: `pnpm install && pnpm --filter @macgrading/shared build`

Prove the workspace link actually resolves at compile time and runtime by using a shared utility in the health endpoint (this stays — it doubles as a deployment sanity check that the shared package built correctly):

```ts
import { Controller, Get } from '@nestjs/common';
import { isValidCertNumber } from '@macgrading/shared';

@Controller()
export class AppController {
  @Get('health')
  health(): { status: string; sharedLinked: boolean } {
    return { status: 'ok', sharedLinked: isValidCertNumber('000000001') };
  }
}
```

Update the e2e expectation accordingly:

```ts
      .expect(200)
      .expect({ status: 'ok', sharedLinked: true });
```

- [ ] **Step 6: Run e2e test to verify it passes**

Run: `pnpm --filter @macgrading/api test:e2e`
Expected: PASS.

- [ ] **Step 7: Verify turbo pipeline across the repo**

Run: `pnpm build && pnpm test`
Expected: shared builds before api (pipeline `dependsOn: ^build`); all tests pass. Note: Nest's generated `test` script runs unit tests — with the generated spec deleted, jest may exit non-zero on "no tests". If so, set `"test": "jest --passWithNoTests"` in `apps/api/package.json`.

- [ ] **Step 8: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat: scaffold nest api with health endpoint"
```

---

### Task 7: Prisma schema, migration, and seed

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/.env` (from `.env.example`, gitignored)

**Interfaces:**
- Consumes: Postgres from Task 2, Nest app from Task 6.
- Produces: full database schema (all Phase-2+ models), `PrismaService` (extends `PrismaClient`, injectable, exported by global `PrismaModule`), idempotent seed (`CertCounter` rows STANDARD/PROTOTYPE at `nextValue: 1`; `GradeName` 1 → "Lil' Mac", 10 → "Mac Daddy"). Scripts: `pnpm --filter @macgrading/api db:migrate`, `db:seed`.

- [ ] **Step 1: Install Prisma**

Run: `pnpm --filter @macgrading/api add -D prisma && pnpm --filter @macgrading/api add @prisma/client`

- [ ] **Step 2: Write the schema**

`apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  TEAM_MEMBER
}

enum CertStatus {
  PENDING_GRADE
  GRADED
}

enum CertCounterType {
  STANDARD
  PROTOTYPE
}

model User {
  id          String   @id @default(uuid())
  email       String   @unique
  name        String
  googleId    String?  @unique
  role        Role     @default(TEAM_MEMBER)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  gradedCerts Cert[]
}

model Cert {
  id              String     @id @default(uuid())
  certNumber      String     @unique
  isPrototype     Boolean
  status          CertStatus @default(PENDING_GRADE)

  // Card snapshot, copied from CardboardTens at mint time (spec: certs are
  // append-mostly ledger records; cardboardTensId is provenance only).
  cardboardTensId String
  cardName        String
  setName         String
  cardNumber      String?
  releaseYear     Int?
  category        String?
  cardImageUrl    String?

  grade      Decimal?  @db.Decimal(4, 1)
  gradeName  String?
  gradedById String?
  gradedBy   User?     @relation(fields: [gradedById], references: [id])
  gradedAt   DateTime?
  createdAt  DateTime  @default(now())
  photos     CertPhoto[]

  @@index([createdAt])
}

model CertPhoto {
  id          String   @id @default(uuid())
  certId      String
  cert        Cert     @relation(fields: [certId], references: [id])
  objectKey   String
  contentType String
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  @@index([certId])
}

model CertCounter {
  type      CertCounterType @id
  nextValue Int             @default(1)
}

model GradeName {
  gradeValue Decimal @id @db.Decimal(4, 1)
  name       String
}
```

- [ ] **Step 3: Add scripts and env**

Copy env: `cp .env.example apps/api/.env` (the api reads `DATABASE_URL` from its own `.env`; file is gitignored).

Add to `apps/api/package.json` scripts:

```json
{
  "scripts": {
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "ts-node prisma/seed.ts"
  },
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

(`ts-node` ships with the generated Nest devDependencies.)

- [ ] **Step 4: Run the initial migration**

Run: `docker compose up -d --wait && pnpm --filter @macgrading/api exec prisma migrate dev --name init`
Expected: migration created under `apps/api/prisma/migrations/`, applied, Prisma client generated.

- [ ] **Step 5: Write the idempotent seed**

`apps/api/prisma/seed.ts`:

```ts
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  for (const type of ['STANDARD', 'PROTOTYPE'] as const) {
    await prisma.certCounter.upsert({
      where: { type },
      update: {},
      create: { type, nextValue: 1 },
    });
  }

  const gradeNames: Array<{ gradeValue: string; name: string }> = [
    { gradeValue: '1', name: "Lil' Mac" },
    { gradeValue: '10', name: 'Mac Daddy' },
  ];
  for (const { gradeValue, name } of gradeNames) {
    await prisma.gradeName.upsert({
      where: { gradeValue: new Prisma.Decimal(gradeValue) },
      update: { name },
      create: { gradeValue: new Prisma.Decimal(gradeValue), name },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Note the upsert semantics: counters use `update: {}` (never reset a live
counter), grade names use `update: { name }` (renames propagate to the
lookup table; certs keep their frozen copy — per spec).

- [ ] **Step 6: Run the seed twice to verify idempotency**

Run: `pnpm --filter @macgrading/api db:seed && pnpm --filter @macgrading/api db:seed`
Expected: both runs exit 0.

Verify: `docker compose exec postgres psql -U macgrading -c 'SELECT type, "nextValue" FROM "CertCounter"; SELECT "gradeValue", name FROM "GradeName";'`
Expected: STANDARD 1, PROTOTYPE 1; 1.0 "Lil' Mac", 10.0 "Mac Daddy".

- [ ] **Step 7: Add PrismaService and PrismaModule**

`apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Update `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 8: Verify build and e2e still pass**

Run: `pnpm build && pnpm --filter @macgrading/api test:e2e`
Expected: PASS (health e2e now boots PrismaModule; requires docker-compose Postgres running).

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat: prisma schema, initial migration, seed, PrismaService"
```

---

## Phase 1 exit criteria

- `pnpm install && pnpm build && pnpm test` green from a fresh clone (with docker compose up).
- `docker compose up -d --wait` yields healthy Postgres + MinIO with `slab-photos` bucket.
- `@macgrading/shared` exports tested cert-number utilities + domain DTOs.
- `@macgrading/api` serves `GET /health`, connects to Postgres via `PrismaService`, schema migrated and seeded.

Phase 2 (API core: auth/CASL, minting, grading, card stub, photos) gets its own plan once this lands.
