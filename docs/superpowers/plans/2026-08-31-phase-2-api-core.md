# MAC Grading Phase 2: API Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Nest.js API surface: Google-exchange auth with our own JWT and CASL permissions, transactional cert minting, grading with frozen grade names, the CardboardTens stub, photo presign/register against S3/MinIO, and the public cert lookup/search endpoints.

**Architecture:** Feature modules (`auth`, `cards`, `grade-names`, `certs`, `storage`) on top of Phase 1's `PrismaModule`. Guards enforce our JWT + CASL abilities (ability builder lives in `@macgrading/shared`). E2e tests run against a real Postgres test database (auto-created and migrated) and real MinIO; Google verification is the only faked boundary.

**Tech Stack:** Nest.js 11, Prisma 6.19.3, @nestjs/config + class-validator, @nestjs/jwt, google-auth-library, @casl/ability, @aws-sdk/client-s3 + s3-request-presigner, jest + supertest.

**Spec:** `docs/superpowers/specs/2026-08-31-mac-grading-design.md`

## Global Constraints

- Cert numbers: exactly nine digits, leading zeroes, single `P` prefix for prototypes; two independent sequences starting at 1; minted via `SELECT … FOR UPDATE` on `CertCounter` + insert in ONE transaction (no gaps on rollback).
- `certNumber` is the only cert identifier the API exposes; the uuid never appears in URLs or response bodies.
- Decimal grades travel as **strings** in JSON; dates as ISO-8601 strings. Valid grade input: `1`–`10`, at most one decimal place.
- Grade names freeze onto the cert at grading time; renaming a `GradeName` row never changes existing certs. Grading an already-`GRADED` cert → 409. A grade value with no configured name is allowed (frozen name = null).
- Photo object keys: `certs/{certId}/{uuid}`. Allowed content types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`. Presigned PUT expiry: 900 seconds. The API never proxies image bytes.
- CASL: TEAM_MEMBER can `read` Card/GradeName/Cert, `create`+`grade` Cert, `create`+`delete` CertPhoto. ADMIN additionally `manage` User and GradeName. Ability builder `defineAbilityFor` lives in `packages/shared`.
- Our JWT: payload `{ sub: user.id, email, role }`, 30-day expiry, HS256 via `JWT_SECRET`. Auth guard re-checks `isActive` in the DB on every request.
- Public (unauthenticated) endpoints: `GET /certs`, `GET /certs/:certNumber`, `GET /health` only. Everything else requires our JWT.
- Error responses keep Nest's `{ statusCode, message, error }` shape; unknown errors become a plain 500 without leaking internals.
- No workspace other than `@macgrading/api` may depend on `@prisma/client`.
- E2e tests run against `<dbname>_test` (auto-created), never the dev database. TDD for all service logic; commit after every green cycle.

---

### Task 1: Config validation, error filter, e2e test-database infrastructure

**Files:**
- Create: `apps/api/src/config/env.validation.ts`
- Create: `apps/api/src/common/http-exception.filter.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/setup/test-db-url.ts`
- Create: `apps/api/test/setup/global-setup.ts`
- Create: `apps/api/test/setup/env-setup.ts`
- Create: `apps/api/test/setup/test-db.ts`
- Modify: `apps/api/test/jest-e2e.json`
- Modify: `apps/api/package.json` (deps + scripts)
- Modify: `turbo.json`, root `package.json`, `README.md`, `.env.example`

**Interfaces:**
- Consumes: Phase 1's `PrismaModule`, `.env` conventions, turbo pipeline.
- Produces (all later tasks rely on these):
  - `ConfigService` (global) with validated env: `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, optional `S3_PUBLIC_URL`, optional `ADMIN_EMAILS`.
  - Global `ValidationPipe` (whitelist, transform) and `HttpExceptionFilter`.
  - E2e infra: test DB `<dbname>_test` auto-created + migrated in jest `globalSetup`; every e2e worker's `DATABASE_URL` points at it; `resetDb(prisma)` truncates data tables and re-seeds counters (1) + grade names (1 → "Lil' Mac", 10 → "Mac Daddy").
  - `pnpm test:e2e` at repo root via turbo (carried item from Phase 1).

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @macgrading/api add @nestjs/config class-validator class-transformer && pnpm --filter @macgrading/api add -D pg @types/pg dotenv`

- [ ] **Step 2: Write env validation**

`apps/api/src/config/env.validation.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, IsNotEmpty, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString() @IsNotEmpty() DATABASE_URL!: string;
  @IsString() @IsNotEmpty() JWT_SECRET!: string;
  @IsString() @IsNotEmpty() GOOGLE_CLIENT_ID!: string;
  @IsString() @IsNotEmpty() S3_ENDPOINT!: string;
  @IsString() @IsNotEmpty() S3_ACCESS_KEY!: string;
  @IsString() @IsNotEmpty() S3_SECRET_KEY!: string;
  @IsString() @IsNotEmpty() S3_BUCKET!: string;
  @IsString() @IsNotEmpty() S3_REGION!: string;
  @IsOptional() @IsString() S3_PUBLIC_URL?: string;
  @IsOptional() @IsString() ADMIN_EMAILS?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const missing = errors.map((e) => e.property).join(', ');
    throw new Error(`Invalid environment configuration: ${missing}`);
  }
  return validated;
}
```

- [ ] **Step 3: Write the exception filter**

`apps/api/src/common/http-exception.filter.ts`:

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}
```

- [ ] **Step 4: Wire config, pipe, and filter**

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

`apps/api/src/main.ts`:

```ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 5: Extend .env.example (and mirror into apps/api/.env locally)**

Append to `.env.example`:

```
# Auth
JWT_SECRET=dev-secret-do-not-use-in-production
GOOGLE_CLIENT_ID=placeholder.apps.googleusercontent.com

# Seeded admin users (comma-separated emails; optional)
ADMIN_EMAILS=

# Public base URL for photos (defaults to S3_ENDPOINT when unset)
# S3_PUBLIC_URL=
```

Also append the same new keys to the gitignored `apps/api/.env` on this machine (keep its existing `DATABASE_URL` port untouched).

- [ ] **Step 6: Write the e2e test-DB infrastructure**

`apps/api/test/setup/test-db-url.ts`:

```ts
import * as path from 'path';
import * as dotenv from 'dotenv';

/** Loads apps/api/.env and returns { devUrl, testUrl } where testUrl targets `<db>_test`. */
export function resolveDbUrls(): { devUrl: string; testUrl: string } {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    throw new Error('DATABASE_URL missing — copy .env.example to apps/api/.env');
  }
  const url = new URL(devUrl);
  url.pathname = `${url.pathname}_test`;
  return { devUrl, testUrl: url.toString() };
}
```

`apps/api/test/setup/global-setup.ts`:

```ts
import { execSync } from 'child_process';
import * as path from 'path';
import { Client } from 'pg';
import { resolveDbUrls } from './test-db-url';

export default async function globalSetup() {
  const { devUrl, testUrl } = resolveDbUrls();
  const testDbName = new URL(testUrl).pathname.slice(1);

  const admin = new Client({ connectionString: devUrl });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    testDbName,
  ]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${testDbName}"`);
  }
  await admin.end();

  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
}
```

`apps/api/test/setup/env-setup.ts` (runs in every jest worker, before any import of the app):

```ts
import { resolveDbUrls } from './test-db-url';

process.env.DATABASE_URL = resolveDbUrls().testUrl;
```

`apps/api/test/setup/test-db.ts`:

```ts
import { PrismaClient, Prisma } from '@prisma/client';

/** Truncates data tables and restores the baseline seed (counters at 1, two grade names). */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "CertPhoto", "Cert", "User", "CertCounter", "GradeName" CASCADE',
  );
  await prisma.certCounter.createMany({
    data: [
      { type: 'STANDARD', nextValue: 1 },
      { type: 'PROTOTYPE', nextValue: 1 },
    ],
  });
  await prisma.gradeName.createMany({
    data: [
      { gradeValue: new Prisma.Decimal('1'), name: "Lil' Mac" },
      { gradeValue: new Prisma.Decimal('10'), name: 'Mac Daddy' },
    ],
  });
}
```

Update `apps/api/test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "globalSetup": "<rootDir>/setup/global-setup.ts",
  "setupFiles": ["<rootDir>/setup/env-setup.ts"],
  "maxWorkers": 1
}
```

(`maxWorkers: 1` — e2e specs share one test database; parallel workers would interfere. Merge with the existing generated keys rather than dropping any.)

- [ ] **Step 7: Wire turbo + root scripts + README**

`turbo.json` — add:

```json
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false
    }
```

Root `package.json` scripts — add: `"test:e2e": "turbo run test:e2e"`.

`README.md` — change the e2e line to:

```markdown
API e2e tests (need the docker stack running; they use a separate `_test` database):

    pnpm test:e2e
```

- [ ] **Step 8: Run the existing e2e against the new infra**

Run: `pnpm test:e2e`
Expected: turbo runs `@macgrading/api#test:e2e`; global setup creates `macgrading_test` and applies migrations; health e2e passes against the test DB. (The health spec needs no resetDb.)

Sanity-check isolation: `docker compose exec postgres psql -U macgrading -c '\l'` lists both `macgrading` and `macgrading_test`.

- [ ] **Step 9: Verify env validation fails loudly**

Run: `cd apps/api && JWT_SECRET= pnpm exec ts-node -e "require('dotenv').config(); process.env.JWT_SECRET=''; const { validateEnv } = require('./src/config/env.validation'); try { validateEnv(process.env); console.log('NO ERROR — BUG'); } catch (e) { console.log('OK:', e.message); }"`
Expected: prints `OK: Invalid environment configuration: JWT_SECRET`.

- [ ] **Step 10: Commit**

```bash
git add apps/api turbo.json package.json README.md .env.example pnpm-lock.yaml
git commit -m "feat: env validation, exception filter, e2e test-db infra, turbo test:e2e"
```

---

### Task 2: Enum-drift guard test (carried from Phase 1)

**Files:**
- Test: `apps/api/src/shared-sync.spec.ts`

**Interfaces:**
- Consumes: `@prisma/client` enums (`Role`, `CertStatus`, `CertCounterType`), shared arrays (`ROLES`, `CERT_STATUSES`, `CERT_COUNTER_TYPES`).
- Produces: a unit test that fails whenever the Prisma enums and shared unions drift apart.

- [ ] **Step 1: Write the failing-capable test**

`apps/api/src/shared-sync.spec.ts`:

```ts
import { CertCounterType, CertStatus, Role } from '@prisma/client';
import { CERT_COUNTER_TYPES, CERT_STATUSES, ROLES } from '@macgrading/shared';

describe('shared unions stay in sync with Prisma enums', () => {
  it('Role', () => {
    expect(Object.values(Role).sort()).toEqual([...ROLES].sort());
  });

  it('CertStatus', () => {
    expect(Object.values(CertStatus).sort()).toEqual([...CERT_STATUSES].sort());
  });

  it('CertCounterType', () => {
    expect(Object.values(CertCounterType).sort()).toEqual([...CERT_COUNTER_TYPES].sort());
  });
});
```

- [ ] **Step 2: Run it (and prove it can fail)**

Run: `pnpm --filter @macgrading/api test`
Expected: 3 passing (this replaces `--passWithNoTests` as the api's first real unit test).

Prove the guard bites: temporarily change `ROLES` in `packages/shared/src/domain.ts` to add a fake role, run `pnpm --filter @macgrading/shared build && pnpm --filter @macgrading/api test`, confirm FAIL, then revert and confirm PASS again.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared-sync.spec.ts
git commit -m "test: guard against enum drift between shared unions and prisma"
```

---

### Task 3: CASL abilities in `@macgrading/shared` (TDD)

**Files:**
- Create: `packages/shared/src/abilities.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add `@casl/ability`)
- Test: `packages/shared/src/abilities.test.ts`

**Interfaces:**
- Consumes: `Role` type from `./domain`.
- Produces (API guards in Task 4 and mobile UI later rely on these exact names):
  - `type Action = 'manage' | 'create' | 'read' | 'update' | 'delete' | 'grade'`
  - `type Subject = 'Cert' | 'CertPhoto' | 'User' | 'GradeName' | 'Card' | 'all'`
  - `type AppAbility` (CASL `MongoAbility<[Action, Subject]>`)
  - `defineAbilityFor(user: { role: Role }): AppAbility`

- [ ] **Step 1: Install dependency**

Run: `pnpm --filter @macgrading/shared add @casl/ability`

- [ ] **Step 2: Write the failing tests**

`packages/shared/src/abilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defineAbilityFor } from './abilities';

describe('defineAbilityFor', () => {
  const teamMember = defineAbilityFor({ role: 'TEAM_MEMBER' });
  const admin = defineAbilityFor({ role: 'ADMIN' });

  it('team members can run the cert workflow', () => {
    expect(teamMember.can('create', 'Cert')).toBe(true);
    expect(teamMember.can('grade', 'Cert')).toBe(true);
    expect(teamMember.can('read', 'Cert')).toBe(true);
    expect(teamMember.can('read', 'Card')).toBe(true);
    expect(teamMember.can('read', 'GradeName')).toBe(true);
    expect(teamMember.can('create', 'CertPhoto')).toBe(true);
    expect(teamMember.can('delete', 'CertPhoto')).toBe(true);
  });

  it('team members cannot administer users or grade names', () => {
    expect(teamMember.can('manage', 'User')).toBe(false);
    expect(teamMember.can('create', 'User')).toBe(false);
    expect(teamMember.can('update', 'GradeName')).toBe(false);
    expect(teamMember.can('delete', 'GradeName')).toBe(false);
  });

  it('admins can do everything team members can', () => {
    expect(admin.can('create', 'Cert')).toBe(true);
    expect(admin.can('grade', 'Cert')).toBe(true);
    expect(admin.can('create', 'CertPhoto')).toBe(true);
  });

  it('admins additionally manage users and grade names', () => {
    expect(admin.can('manage', 'User')).toBe(true);
    expect(admin.can('update', 'GradeName')).toBe(true);
    expect(admin.can('delete', 'User')).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @macgrading/shared test`
Expected: FAIL — cannot resolve `./abilities`. Capture the verbatim output.

- [ ] **Step 4: Implement**

`packages/shared/src/abilities.ts`:

```ts
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import type { Role } from './domain';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete' | 'grade';
export type Subject = 'Cert' | 'CertPhoto' | 'User' | 'GradeName' | 'Card' | 'all';
export type AppAbility = MongoAbility<[Action, Subject]>;

export function defineAbilityFor(user: { role: Role }): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  can('read', 'Cert');
  can('read', 'Card');
  can('read', 'GradeName');
  can('create', 'Cert');
  can('grade', 'Cert');
  can(['create', 'delete'], 'CertPhoto');

  if (user.role === 'ADMIN') {
    can('manage', 'User');
    can('manage', 'GradeName');
  }

  return build();
}
```

Update `packages/shared/src/index.ts`:

```ts
export * from './abilities';
export * from './cert-number';
export * from './domain';

export const SHARED_PACKAGE_NAME = '@macgrading/shared';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @macgrading/shared test`
Expected: all pass (typecheck + vitest). Capture verbatim GREEN output.

- [ ] **Step 6: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat: CASL ability builder in shared package"
```

---

### Task 4: Auth module — Google exchange, our JWT, guards, admin seeding

**Files:**
- Create: `apps/api/src/auth/google-token-verifier.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/policies.guard.ts`
- Create: `apps/api/src/auth/check-policies.decorator.ts`
- Create: `apps/api/src/auth/current-user.decorator.ts`
- Create: `apps/api/src/auth/dto/google-login.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/prisma/seed.ts` (ADMIN_EMAILS)
- Modify: `apps/api/package.json` (`db:seed` → `prisma db seed`; deps)
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService`; `defineAbilityFor`, `AppAbility`, `Action`, `Subject` from `@macgrading/shared`; `ConfigService` env from Task 1.
- Produces (Tasks 5–9 rely on these exact names):
  - `GOOGLE_TOKEN_VERIFIER` injection token + `interface GoogleTokenVerifier { verify(idToken: string): Promise<GoogleProfile> }` where `GoogleProfile = { email: string; googleId: string; name: string }`.
  - `POST /auth/google` body `{ idToken }` → `{ accessToken, user: { email, name, role } }`; 401 for unknown/inactive email.
  - `GET /auth/me` → `{ email, name, role }`.
  - `JwtAuthGuard` — verifies Bearer token, loads the user fresh (`isActive` required), attaches `req.user` (the Prisma `User`).
  - `@CheckPolicies(handler: (ability: AppAbility) => boolean)` + `PoliciesGuard` — used together with `JwtAuthGuard` on every team route: `@UseGuards(JwtAuthGuard, PoliciesGuard)`.
  - `@CurrentUser()` param decorator returning `req.user`.
  - Test helper pattern: e2e overrides `GOOGLE_TOKEN_VERIFIER` with a fake to obtain real JWTs for seeded users.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @macgrading/api add @nestjs/jwt google-auth-library`

- [ ] **Step 2: Write the failing e2e**

`apps/api/test/auth.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import {
  GOOGLE_TOKEN_VERIFIER,
  GoogleProfile,
} from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

/** Fake verifier: treats the idToken itself as the email of the signing-in user. */
const fakeVerifier = {
  verify: async (idToken: string): Promise<GoogleProfile> => ({
    email: idToken,
    googleId: `google-${idToken}`,
    name: 'Test Person',
  }),
};

describe('auth', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_TOKEN_VERIFIER)
      .useValue(fakeVerifier)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team Member', role: 'TEAM_MEMBER' },
    });
    await prisma.user.create({
      data: {
        email: 'gone@macgrading.com',
        name: 'Former Member',
        role: 'TEAM_MEMBER',
        isActive: false,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('exchanges a Google token for our JWT when the email is allowlisted', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' })
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      email: 'team@macgrading.com',
      name: 'Team Member',
      role: 'TEAM_MEMBER',
    });
  });

  it('stores the googleId on first sign-in', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' })
      .expect(201);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'team@macgrading.com' },
    });
    expect(user.googleId).toBe('google-team@macgrading.com');
  });

  it('rejects unknown emails', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'stranger@example.com' })
      .expect(401);
  });

  it('rejects inactive users', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'gone@macgrading.com' })
      .expect(401);
  });

  it('rejects an empty body', async () => {
    await request(app.getHttpServer()).post('/auth/google').send({}).expect(400);
  });

  it('GET /auth/me returns the current user with a valid token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200)
      .expect({ email: 'team@macgrading.com', name: 'Team Member', role: 'TEAM_MEMBER' });
  });

  it('GET /auth/me rejects missing or garbage tokens', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('rejects a token whose user has since been deactivated', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    await prisma.user.update({
      where: { email: 'team@macgrading.com' },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @macgrading/api test:e2e`
Expected: FAIL — cannot resolve `./../src/auth/google-token-verifier`. Capture output.

- [ ] **Step 4: Implement the verifier boundary**

`apps/api/src/auth/google-token-verifier.ts`:

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  email: string;
  googleId: string;
  name: string;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile>;
}

export const GOOGLE_TOKEN_VERIFIER = Symbol('GOOGLE_TOKEN_VERIFIER');

@Injectable()
export class GoogleAuthTokenVerifier implements GoogleTokenVerifier {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.client = new OAuth2Client(config.getOrThrow<string>('GOOGLE_CLIENT_ID'));
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.sub) {
        throw new Error('missing email or subject');
      }
      return {
        email: payload.email,
        googleId: payload.sub,
        name: payload.name ?? payload.email,
      };
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
  }
}
```

- [ ] **Step 5: Implement service, controller, module, DTO**

`apps/api/src/auth/dto/google-login.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
```

`apps/api/src/auth/auth.service.ts`:

```ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GOOGLE_TOKEN_VERIFIER,
  GoogleTokenVerifier,
} from './google-token-verifier';

export interface AuthUserDto {
  email: string;
  name: string;
  role: string;
}

export function toAuthUserDto(user: User): AuthUserDto {
  return { email: user.email, name: user.name, role: user.role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(GOOGLE_TOKEN_VERIFIER) private readonly google: GoogleTokenVerifier,
  ) {}

  async exchangeGoogleToken(idToken: string) {
    const profile = await this.google.verify(idToken);
    const user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Not a MAC Grading team member');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { googleId: profile.googleId, name: profile.name },
    });
    const accessToken = await this.jwt.signAsync({
      sub: updated.id,
      email: updated.email,
      role: updated.role,
    });
    return { accessToken, user: toAuthUserDto(updated) };
  }
}
```

`apps/api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthService, toAuthUserDto } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.exchangeGoogleToken(dto.idToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return toAuthUserDto(user);
  }
}
```

`apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  GOOGLE_TOKEN_VERIFIER,
  GoogleAuthTokenVerifier,
} from './google-token-verifier';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleAuthTokenVerifier },
  ],
})
export class AuthModule {}
```

- [ ] **Step 6: Implement guards and decorators**

`apps/api/src/auth/jwt-auth.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }
    (request as Request & { user: typeof user }).user = user;
    return true;
  }
}
```

`apps/api/src/auth/check-policies.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { AppAbility } from '@macgrading/shared';

export type PolicyHandler = (ability: AppAbility) => boolean;
export const CHECK_POLICIES_KEY = 'check_policies';
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
```

`apps/api/src/auth/policies.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { defineAbilityFor } from '@macgrading/shared';
import { CHECK_POLICIES_KEY, PolicyHandler } from './check-policies.decorator';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers =
      this.reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, context.getHandler()) ??
      [];
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: User }>();
    if (!user) {
      throw new ForbiddenException('PoliciesGuard requires JwtAuthGuard first');
    }
    const ability = defineAbilityFor(user);
    if (!handlers.every((handler) => handler(ability))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
```

`apps/api/src/auth/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<{ user: User }>().user,
);
```

Register the module — `apps/api/src/app.module.ts` imports becomes:

```ts
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
```

(with `import { AuthModule } from './auth/auth.module';`)

- [ ] **Step 7: Admin seeding from ADMIN_EMAILS**

Append to `apps/api/prisma/seed.ts` `main()` (after the grade-name loop):

```ts
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN', isActive: true },
      create: { email, name: email, role: 'ADMIN' },
    });
  }
```

Change the `db:seed` script in `apps/api/package.json` to `"db:seed": "prisma db seed"` (the Prisma CLI loads `.env` into `process.env`, so `ADMIN_EMAILS` is visible; plain `ts-node` would miss it).

- [ ] **Step 8: Run e2e to verify green**

Run: `pnpm test:e2e`
Expected: auth spec + health spec pass. Capture verbatim output.

- [ ] **Step 9: Verify seeding**

Set `ADMIN_EMAILS` in `apps/api/.env` to a test value (e.g. `admin@macgrading.com`), run `pnpm --filter @macgrading/api db:seed`, verify with `docker compose exec postgres psql -U macgrading -c 'SELECT email, role FROM "User";'`, then remove the test value if the user hasn't configured a real one. Report what you set.

- [ ] **Step 10: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat: google token exchange, our JWT, CASL guards, admin seeding"
```

---

### Task 5: Grade-names endpoint + CardboardTens stub

**Files:**
- Create: `apps/api/src/grade-names/grade-names.service.ts`
- Create: `apps/api/src/grade-names/grade-names.controller.ts`
- Create: `apps/api/src/grade-names/grade-names.module.ts`
- Create: `apps/api/src/cards/card-catalog.service.ts`
- Create: `apps/api/src/cards/stub-card-catalog.service.ts`
- Create: `apps/api/src/cards/cards.controller.ts`
- Create: `apps/api/src/cards/cards.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/grade-names.e2e-spec.ts`, `apps/api/test/cards.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 4 guards (`JwtAuthGuard`, `PoliciesGuard`, `CheckPolicies`), `GradeNameDto`/`CardSummary` from shared, fake-verifier login pattern from the auth e2e.
- Produces:
  - `GET /grade-names` (team) → `GradeNameDto[]` ordered by `gradeValue` ascending, `gradeValue` as string.
  - `abstract class CardCatalogService { search(query: string): Promise<CardSummary[]>; getById(cardboardTensId: string): Promise<CardSummary | null> }` — **Task 6 minting calls `getById`**.
  - `CardsModule` exports `CardCatalogService` (stub-backed).
  - `GET /cards/search?q=` (team) → `CardSummary[]`; `q` required, min length 2 → 400 otherwise.
  - E2e helper file pattern: `login(app, email)` returning a Bearer token (each spec defines it locally with the fake verifier).

- [ ] **Step 1: Write the failing e2e tests**

`apps/api/test/grade-names.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('grade names', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer()).post('/auth/google').send({ idToken: email });
    return res.body.accessToken;
  };

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires auth', async () => {
    await request(app.getHttpServer()).get('/grade-names').expect(401);
  });

  it('returns configured names ordered by grade value, decimals as strings', async () => {
    const token = await login('team@macgrading.com');
    const res = await request(app.getHttpServer())
      .get('/grade-names')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual([
      { gradeValue: '1', name: "Lil' Mac" },
      { gradeValue: '10', name: 'Mac Daddy' },
    ]);
  });
});
```

`apps/api/test/cards.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('card catalog (stub)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer()).post('/auth/google').send({ idToken: email });
    return res.body.accessToken;
  };

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires auth', async () => {
    await request(app.getHttpServer()).get('/cards/search?q=char').expect(401);
  });

  it('finds cards by case-insensitive name fragment', async () => {
    const token = await login('team@macgrading.com');
    const res = await request(app.getHttpServer())
      .get('/cards/search?q=CHAR')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      cardboardTensId: expect.any(String),
      cardName: expect.stringMatching(/char/i),
      setName: expect.any(String),
    });
  });

  it('rejects queries shorter than 2 characters', async () => {
    const token = await login('team@macgrading.com');
    await request(app.getHttpServer())
      .get('/cards/search?q=c')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:e2e`
Expected: both new specs FAIL (modules unresolvable / 404s). Capture output.

- [ ] **Step 3: Implement grade names**

`apps/api/src/grade-names/grade-names.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { GradeNameDto } from '@macgrading/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GradeNamesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<GradeNameDto[]> {
    const rows = await this.prisma.gradeName.findMany({
      orderBy: { gradeValue: 'asc' },
    });
    return rows.map((row) => ({
      gradeValue: row.gradeValue.toString(),
      name: row.name,
    }));
  }
}
```

`apps/api/src/grade-names/grade-names.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { GradeNamesService } from './grade-names.service';

@Controller('grade-names')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class GradeNamesController {
  constructor(private readonly gradeNames: GradeNamesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'GradeName'))
  list() {
    return this.gradeNames.list();
  }
}
```

`apps/api/src/grade-names/grade-names.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { GradeNamesController } from './grade-names.controller';
import { GradeNamesService } from './grade-names.service';

@Module({
  controllers: [GradeNamesController],
  providers: [GradeNamesService],
})
export class GradeNamesModule {}
```

- [ ] **Step 4: Implement the card catalog stub**

`apps/api/src/cards/card-catalog.service.ts`:

```ts
import { CardSummary } from '@macgrading/shared';

/**
 * Boundary to the CardboardTens card catalog. Stub-backed until the real
 * API exists — swapping implementations is a one-line provider change
 * in CardsModule (see spec: CardboardTens integration).
 */
export abstract class CardCatalogService {
  abstract search(query: string): Promise<CardSummary[]>;
  abstract getById(cardboardTensId: string): Promise<CardSummary | null>;
}
```

`apps/api/src/cards/stub-card-catalog.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { CardSummary } from '@macgrading/shared';
import { CardCatalogService } from './card-catalog.service';

const STUB_CARDS: CardSummary[] = [
  { cardboardTensId: 'cbt-0001', cardName: 'Charizard', setName: 'Base Set', cardNumber: '4/102', releaseYear: 1999, category: 'Pokemon', cardImageUrl: null },
  { cardboardTensId: 'cbt-0002', cardName: 'Pikachu', setName: 'Jungle', cardNumber: '60/64', releaseYear: 1999, category: 'Pokemon', cardImageUrl: null },
  { cardboardTensId: 'cbt-0003', cardName: 'Blastoise', setName: 'Base Set', cardNumber: '2/102', releaseYear: 1999, category: 'Pokemon', cardImageUrl: null },
  { cardboardTensId: 'cbt-0004', cardName: 'Black Lotus', setName: 'Alpha', cardNumber: null, releaseYear: 1993, category: 'Magic: The Gathering', cardImageUrl: null },
  { cardboardTensId: 'cbt-0005', cardName: 'Ken Griffey Jr.', setName: 'Upper Deck', cardNumber: '1', releaseYear: 1989, category: 'Baseball', cardImageUrl: null },
  { cardboardTensId: 'cbt-0006', cardName: 'Michael Jordan', setName: 'Fleer', cardNumber: '57', releaseYear: 1986, category: 'Basketball', cardImageUrl: null },
  { cardboardTensId: 'cbt-0007', cardName: 'Blue-Eyes White Dragon', setName: 'Legend of Blue Eyes', cardNumber: 'LOB-001', releaseYear: 2002, category: 'Yu-Gi-Oh!', cardImageUrl: null },
  { cardboardTensId: 'cbt-0008', cardName: 'Wayne Gretzky', setName: 'O-Pee-Chee', cardNumber: '18', releaseYear: 1979, category: 'Hockey', cardImageUrl: null },
];

@Injectable()
export class StubCardCatalogService extends CardCatalogService {
  async search(query: string): Promise<CardSummary[]> {
    const q = query.toLowerCase();
    return STUB_CARDS.filter(
      (card) =>
        card.cardName.toLowerCase().includes(q) ||
        card.setName.toLowerCase().includes(q) ||
        (card.category ?? '').toLowerCase().includes(q),
    );
  }

  async getById(cardboardTensId: string): Promise<CardSummary | null> {
    return STUB_CARDS.find((card) => card.cardboardTensId === cardboardTensId) ?? null;
  }
}
```

`apps/api/src/cards/cards.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { CardCatalogService } from './card-catalog.service';

class SearchCardsQuery {
  @IsString()
  @MinLength(2)
  q!: string;
}

@Controller('cards')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class CardsController {
  constructor(private readonly catalog: CardCatalogService) {}

  @Get('search')
  @CheckPolicies((ability) => ability.can('read', 'Card'))
  search(@Query() query: SearchCardsQuery) {
    return this.catalog.search(query.q);
  }
}
```

`apps/api/src/cards/cards.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CardCatalogService } from './card-catalog.service';
import { CardsController } from './cards.controller';
import { StubCardCatalogService } from './stub-card-catalog.service';

@Module({
  controllers: [CardsController],
  providers: [{ provide: CardCatalogService, useClass: StubCardCatalogService }],
  exports: [CardCatalogService],
})
export class CardsModule {}
```

Add `GradeNamesModule` and `CardsModule` to `AppModule` imports.

- [ ] **Step 5: Run e2e to verify green**

Run: `pnpm test:e2e`
Expected: all specs pass. Capture verbatim output.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat: grade-names endpoint and CardboardTens catalog stub"
```

---

### Task 6: Cert minting — transactional counter + POST /certs

**Files:**
- Create: `apps/api/src/certs/cert.serializer.ts`
- Create: `apps/api/src/certs/certs.service.ts`
- Create: `apps/api/src/certs/certs.controller.ts`
- Create: `apps/api/src/certs/certs.module.ts`
- Create: `apps/api/src/certs/dto/create-cert.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/certs-mint.e2e-spec.ts`

**Interfaces:**
- Consumes: `CardCatalogService.getById` (Task 5), `formatCertNumber`/`MAX_CERT_SEQUENCE`/`CertDto` from shared, guards from Task 4, `ConfigService` S3 vars (for photo URLs in the serializer).
- Produces (Tasks 7–9 rely on these):
  - `toCertDto(cert: Cert & { photos: CertPhoto[] }, publicUrlBase: string): CertDto` in `cert.serializer.ts`.
  - `CertsService.mint(input: { cardboardTensId: string; isPrototype: boolean }): Promise<CertDto>` — snapshot + `SELECT … FOR UPDATE` counter + insert, one transaction; 404 if card unknown.
  - `CertsService.publicUrlBase(): string` (from `S3_PUBLIC_URL ?? S3_ENDPOINT`, plus `/S3_BUCKET`).
  - `POST /certs` (team, `create Cert`) body `{ cardboardTensId, isPrototype }` → 201 `CertDto` with `status: 'PENDING_GRADE'`.
  - `CertsModule` (imports `CardsModule`) — Tasks 7–9 add controllers/methods to these same files.

- [ ] **Step 1: Write the failing e2e**

`apps/api/test/certs-mint.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('cert minting', () => {
  let app: INestApplication;
  let token: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const mint = (body: object) =>
    request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('requires auth', async () => {
    await request(app.getHttpServer())
      .post('/certs')
      .send({ cardboardTensId: 'cbt-0001', isPrototype: false })
      .expect(401);
  });

  it('mints sequential standard numbers with a full card snapshot', async () => {
    const first = await mint({ cardboardTensId: 'cbt-0001', isPrototype: false }).expect(201);
    expect(first.body).toMatchObject({
      certNumber: '000000001',
      isPrototype: false,
      status: 'PENDING_GRADE',
      cardboardTensId: 'cbt-0001',
      cardName: 'Charizard',
      setName: 'Base Set',
      cardNumber: '4/102',
      releaseYear: 1999,
      category: 'Pokemon',
      grade: null,
      gradeName: null,
      photos: [],
    });
    expect(first.body).not.toHaveProperty('id');

    const second = await mint({ cardboardTensId: 'cbt-0002', isPrototype: false }).expect(201);
    expect(second.body.certNumber).toBe('000000002');
  });

  it('prototype numbers run on their own sequence', async () => {
    await mint({ cardboardTensId: 'cbt-0001', isPrototype: false }).expect(201);
    const proto = await mint({ cardboardTensId: 'cbt-0002', isPrototype: true }).expect(201);
    expect(proto.body.certNumber).toBe('P000000001');
  });

  it('404s for an unknown card and does not consume a number', async () => {
    await mint({ cardboardTensId: 'cbt-nope', isPrototype: false }).expect(404);
    const next = await mint({ cardboardTensId: 'cbt-0001', isPrototype: false }).expect(201);
    expect(next.body.certNumber).toBe('000000001');
  });

  it('rejects malformed bodies', async () => {
    await mint({ cardboardTensId: 'cbt-0001' }).expect(400);
    await mint({ isPrototype: true }).expect(400);
  });

  it('concurrent mints produce unique consecutive numbers with no gaps', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        mint({ cardboardTensId: 'cbt-0001', isPrototype: false }),
      ),
    );
    const numbers = results.map((r) => {
      expect(r.status).toBe(201);
      return r.body.certNumber as string;
    });
    expect(new Set(numbers).size).toBe(10);
    expect([...numbers].sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(9, '0')),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:e2e`
Expected: FAIL (404s — no /certs route). Capture output.

- [ ] **Step 3: Implement serializer, service, controller, module**

`apps/api/src/certs/cert.serializer.ts`:

```ts
import { Cert, CertPhoto } from '@prisma/client';
import { CertDto, CertStatus } from '@macgrading/shared';

export function toCertDto(
  cert: Cert & { photos: CertPhoto[] },
  publicUrlBase: string,
): CertDto {
  return {
    certNumber: cert.certNumber,
    isPrototype: cert.isPrototype,
    status: cert.status as CertStatus,
    cardboardTensId: cert.cardboardTensId,
    cardName: cert.cardName,
    setName: cert.setName,
    cardNumber: cert.cardNumber,
    releaseYear: cert.releaseYear,
    category: cert.category,
    cardImageUrl: cert.cardImageUrl,
    grade: cert.grade ? cert.grade.toString() : null,
    gradeName: cert.gradeName,
    gradedAt: cert.gradedAt ? cert.gradedAt.toISOString() : null,
    createdAt: cert.createdAt.toISOString(),
    photos: [...cert.photos]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((photo) => ({
        id: photo.id,
        url: `${publicUrlBase}/${photo.objectKey}`,
        sortOrder: photo.sortOrder,
      })),
  };
}
```

`apps/api/src/certs/dto/create-cert.dto.ts`:

```ts
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateCertDto {
  @IsString()
  @IsNotEmpty()
  cardboardTensId!: string;

  @IsBoolean()
  isPrototype!: boolean;
}
```

`apps/api/src/certs/certs.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertCounterType } from '@prisma/client';
import { CertDto, formatCertNumber } from '@macgrading/shared';
import { CardCatalogService } from '../cards/card-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { toCertDto } from './cert.serializer';
import { CreateCertDto } from './dto/create-cert.dto';

@Injectable()
export class CertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CardCatalogService,
    private readonly config: ConfigService,
  ) {}

  publicUrlBase(): string {
    const base =
      this.config.get<string>('S3_PUBLIC_URL') ??
      this.config.getOrThrow<string>('S3_ENDPOINT');
    const bucket = this.config.getOrThrow<string>('S3_BUCKET');
    return `${base.replace(/\/$/, '')}/${bucket}`;
  }

  async mint(input: CreateCertDto): Promise<CertDto> {
    const card = await this.catalog.getById(input.cardboardTensId);
    if (!card) {
      throw new NotFoundException(`Unknown card: ${input.cardboardTensId}`);
    }

    const counterType: CertCounterType = input.isPrototype ? 'PROTOTYPE' : 'STANDARD';

    const cert = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ nextValue: number }>>`
        SELECT "nextValue" FROM "CertCounter"
        WHERE "type" = CAST(${counterType} AS "CertCounterType")
        FOR UPDATE
      `;
      const sequenceValue = rows[0].nextValue;
      const certNumber = formatCertNumber(sequenceValue, input.isPrototype);
      await tx.certCounter.update({
        where: { type: counterType },
        data: { nextValue: sequenceValue + 1 },
      });
      return tx.cert.create({
        data: {
          certNumber,
          isPrototype: input.isPrototype,
          cardboardTensId: card.cardboardTensId,
          cardName: card.cardName,
          setName: card.setName,
          cardNumber: card.cardNumber,
          releaseYear: card.releaseYear,
          category: card.category,
          cardImageUrl: card.cardImageUrl,
        },
        include: { photos: true },
      });
    });

    return toCertDto(cert, this.publicUrlBase());
  }
}
```

`apps/api/src/certs/certs.controller.ts`:

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { CertsService } from './certs.service';
import { CreateCertDto } from './dto/create-cert.dto';

@Controller('certs')
export class CertsController {
  constructor(private readonly certs: CertsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('create', 'Cert'))
  mint(@Body() dto: CreateCertDto) {
    return this.certs.mint(dto);
  }
}
```

(Guards are per-route here — NOT on the controller — because Task 9 adds public GET routes to this same controller.)

`apps/api/src/certs/certs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { CertsController } from './certs.controller';
import { CertsService } from './certs.service';

@Module({
  imports: [CardsModule],
  controllers: [CertsController],
  providers: [CertsService],
})
export class CertsModule {}
```

Add `CertsModule` to `AppModule` imports.

- [ ] **Step 4: Run e2e to verify green (including the concurrency test)**

Run: `pnpm test:e2e`
Expected: all pass, concurrency test shows 10 unique consecutive numbers. Capture verbatim output.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: transactional cert minting with card snapshot"
```

---

### Task 7: Grading — PATCH /certs/:certNumber/grade

**Files:**
- Create: `apps/api/src/certs/dto/set-grade.dto.ts`
- Modify: `apps/api/src/certs/certs.service.ts`
- Modify: `apps/api/src/certs/certs.controller.ts`
- Test: `apps/api/test/certs-grade.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 6's `CertsService`/`toCertDto`, `@CurrentUser` from Task 4.
- Produces:
  - `CertsService.setGrade(certNumber: string, grade: string, userId: string): Promise<CertDto>`.
  - `PATCH /certs/:certNumber/grade` (team, `grade Cert`) body `{ grade: "7" | "9.5" | … }` → 200 `CertDto` with frozen `grade`/`gradeName`, `status: 'GRADED'`; 404 unknown cert; 409 already graded; 400 invalid grade string.

- [ ] **Step 1: Write the failing e2e**

`apps/api/test/certs-grade.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('cert grading', () => {
  let app: INestApplication;
  let token: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const mintOne = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardboardTensId: 'cbt-0001', isPrototype: false });
    return res.body.certNumber as string;
  };

  const grade = (certNumber: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/certs/${certNumber}/grade`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('requires auth', async () => {
    const certNumber = await mintOne();
    await request(app.getHttpServer())
      .patch(`/certs/${certNumber}/grade`)
      .send({ grade: '10' })
      .expect(401);
  });

  it('freezes the grade and its configured name', async () => {
    const certNumber = await mintOne();
    const res = await grade(certNumber, { grade: '10' }).expect(200);
    expect(res.body).toMatchObject({
      certNumber,
      status: 'GRADED',
      grade: '10',
      gradeName: 'Mac Daddy',
    });
    expect(res.body.gradedAt).toEqual(expect.any(String));
  });

  it('allows a grade with no configured name (name freezes as null)', async () => {
    const certNumber = await mintOne();
    const res = await grade(certNumber, { grade: '7' }).expect(200);
    expect(res.body.grade).toBe('7');
    expect(res.body.gradeName).toBeNull();
  });

  it('keeps the frozen name when the lookup table is renamed later', async () => {
    const certNumber = await mintOne();
    await grade(certNumber, { grade: '10' }).expect(200);
    await prisma.gradeName.update({
      where: { gradeValue: new Prisma.Decimal('10') },
      data: { name: 'Renamed Daddy' },
    });
    const cert = await prisma.cert.findUniqueOrThrow({ where: { certNumber } });
    expect(cert.gradeName).toBe('Mac Daddy');
  });

  it('409s on regrade — grades are frozen', async () => {
    const certNumber = await mintOne();
    await grade(certNumber, { grade: '10' }).expect(200);
    await grade(certNumber, { grade: '1' }).expect(409);
  });

  it('404s for unknown certs', async () => {
    await grade('999999999', { grade: '10' }).expect(404);
  });

  it('rejects invalid grade strings', async () => {
    const certNumber = await mintOne();
    for (const bad of ['0', '11', '10.5', '7.55', 'ten', '-3', '']) {
      await grade(certNumber, { grade: bad }).expect(400);
    }
  });

  it('records who graded it', async () => {
    const certNumber = await mintOne();
    await grade(certNumber, { grade: '1' }).expect(200);
    const cert = await prisma.cert.findUniqueOrThrow({ where: { certNumber } });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'team@macgrading.com' },
    });
    expect(cert.gradedById).toBe(user.id);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:e2e`
Expected: grading spec FAILs (404 route). Capture output.

- [ ] **Step 3: Implement**

`apps/api/src/certs/dto/set-grade.dto.ts`:

```ts
import { Matches } from 'class-validator';

export class SetGradeDto {
  /** 1–10, at most one decimal place ("7", "9.5", "10"). */
  @Matches(/^(10(\.0)?|[1-9](\.\d)?)$/, {
    message: 'grade must be between 1 and 10 with at most one decimal place',
  })
  grade!: string;
}
```

Add to `apps/api/src/certs/certs.service.ts` (new imports: `ConflictException` from `@nestjs/common`, `Prisma` from `@prisma/client`):

```ts
  async setGrade(certNumber: string, grade: string, userId: string): Promise<CertDto> {
    const cert = await this.prisma.cert.findUnique({ where: { certNumber } });
    if (!cert) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    if (cert.status === 'GRADED') {
      throw new ConflictException('Cert is already graded; grades are frozen');
    }
    const gradeValue = new Prisma.Decimal(grade);
    const gradeName = await this.prisma.gradeName.findUnique({
      where: { gradeValue },
    });
    const updated = await this.prisma.cert.update({
      where: { certNumber },
      data: {
        status: 'GRADED',
        grade: gradeValue,
        gradeName: gradeName?.name ?? null,
        gradedById: userId,
        gradedAt: new Date(),
      },
      include: { photos: true },
    });
    return toCertDto(updated, this.publicUrlBase());
  }
```

Add to `apps/api/src/certs/certs.controller.ts` (new imports: `Param`, `Patch`; `User` from `@prisma/client`; `CurrentUser`, `SetGradeDto`):

```ts
  @Patch(':certNumber/grade')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('grade', 'Cert'))
  setGrade(
    @Param('certNumber') certNumber: string,
    @Body() dto: SetGradeDto,
    @CurrentUser() user: User,
  ) {
    return this.certs.setGrade(certNumber, dto.grade, user.id);
  }
```

- [ ] **Step 4: Run e2e to verify green**

Run: `pnpm test:e2e`
Expected: all pass. Capture verbatim output.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat: cert grading with frozen grade names"
```

---

### Task 8: Storage module + photo presign/register/delete

**Files:**
- Create: `apps/api/src/storage/storage.service.ts`
- Create: `apps/api/src/storage/storage.module.ts`
- Create: `apps/api/src/certs/photos.controller.ts`
- Create: `apps/api/src/certs/dto/presign-photo.dto.ts`
- Create: `apps/api/src/certs/dto/register-photo.dto.ts`
- Modify: `apps/api/src/certs/certs.module.ts`
- Modify: `docker-compose.yml` (public-read bucket)
- Test: `apps/api/test/certs-photos.e2e-spec.ts`

**Interfaces:**
- Consumes: `CertsService`/serializer from Task 6, guards from Task 4, S3 env from Task 1, MinIO from docker-compose.
- Produces:
  - `StorageService`: `presignPut(objectKey, contentType): Promise<string>` (900s expiry), `headContentType(objectKey): Promise<string | null>` (null = object absent), `deleteObject(objectKey): Promise<void>`.
  - `POST /certs/:certNumber/photos/presign` body `{ contentType }` → `{ uploadUrl, objectKey }` with `objectKey = certs/{certId}/{uuid}`; 400 for disallowed content types; 404 unknown cert.
  - `POST /certs/:certNumber/photos` body `{ objectKey, sortOrder? }` → 201 `CertPhotoDto`; 400 if the object was never uploaded or the key doesn't belong to this cert.
  - `DELETE /certs/:certNumber/photos/:photoId` → 204; best-effort object deletion.

- [ ] **Step 1: Install dependencies + make the bucket public-read**

Run: `pnpm --filter @macgrading/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

In `docker-compose.yml`, extend the `minio-init` entrypoint command so the bucket allows anonymous downloads (the web app serves photos straight from the bucket, per spec):

```yaml
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 macgrading macgrading &&
      mc mb --ignore-existing local/slab-photos &&
      mc anonymous set download local/slab-photos
      "
```

Run: `docker compose up -d minio-init` (re-runs the one-shot container; verify exit 0 with `docker compose ps -a`).

- [ ] **Step 2: Write the failing e2e**

`apps/api/test/certs-photos.e2e-spec.ts` (runs against the REAL MinIO — uploads actual bytes through the presigned URL):

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('cert photos', () => {
  let app: INestApplication;
  let token: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const authed = () => ({ Authorization: `Bearer ${token}` });

  const mintOne = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set(authed())
      .send({ cardboardTensId: 'cbt-0001', isPrototype: false });
    return res.body.certNumber as string;
  };

  const uploadPhoto = async (certNumber: string): Promise<string> => {
    const presign = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set(authed())
      .send({ contentType: 'image/jpeg' })
      .expect(201);
    const { uploadUrl, objectKey } = presign.body;
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    });
    expect(put.ok).toBe(true);
    return objectKey as string;
  };

  it('presign requires auth and a known cert', async () => {
    const certNumber = await mintOne();
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .send({ contentType: 'image/jpeg' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/certs/999999999/photos/presign')
      .set(authed())
      .send({ contentType: 'image/jpeg' })
      .expect(404);
  });

  it('rejects disallowed content types', async () => {
    const certNumber = await mintOne();
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set(authed())
      .send({ contentType: 'application/pdf' })
      .expect(400);
  });

  it('full round trip: presign → upload → register → visible on the cert', async () => {
    const certNumber = await mintOne();
    const objectKey = await uploadPhoto(certNumber);
    expect(objectKey).toMatch(/^certs\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);

    const registered = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey, sortOrder: 0 })
      .expect(201);
    expect(registered.body).toMatchObject({
      id: expect.any(String),
      sortOrder: 0,
      url: expect.stringContaining(objectKey),
    });
  });

  it('refuses to register a key that was never uploaded', async () => {
    const certNumber = await mintOne();
    const presign = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos/presign`)
      .set(authed())
      .send({ contentType: 'image/jpeg' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey: presign.body.objectKey })
      .expect(400);
  });

  it("refuses to register another cert's key", async () => {
    const certA = await mintOne();
    const certB = await mintOne();
    const objectKey = await uploadPhoto(certA);
    await request(app.getHttpServer())
      .post(`/certs/${certB}/photos`)
      .set(authed())
      .send({ objectKey })
      .expect(400);
  });

  it('deletes a photo', async () => {
    const certNumber = await mintOne();
    const objectKey = await uploadPhoto(certNumber);
    const registered = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/certs/${certNumber}/photos/${registered.body.id}`)
      .set(authed())
      .expect(204);
    const photos = await prisma.certPhoto.findMany();
    expect(photos).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test:e2e`
Expected: photos spec FAILs (404 routes). Capture output.

- [ ] **Step 4: Implement storage service + module**

`apps/api/src/storage/storage.service.ts`:

```ts
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PRESIGN_EXPIRY_SECONDS = 900;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      region: config.getOrThrow<string>('S3_REGION'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
      forcePathStyle: true, // required for MinIO
    });
  }

  presignPut(objectKey: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS },
    );
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
    } catch (error) {
      this.logger.warn(`Failed to delete ${objectKey}: ${String(error)}`);
    }
  }
}
```

`apps/api/src/storage/storage.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 5: Implement photos controller + DTOs**

`apps/api/src/certs/dto/presign-photo.dto.ts`:

```ts
import { IsIn } from 'class-validator';

export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

export class PresignPhotoDto {
  @IsIn(ALLOWED_PHOTO_TYPES)
  contentType!: (typeof ALLOWED_PHOTO_TYPES)[number];
}
```

`apps/api/src/certs/dto/register-photo.dto.ts`:

```ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class RegisterPhotoDto {
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

`apps/api/src/certs/photos.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CheckPolicies } from '../auth/check-policies.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PoliciesGuard } from '../auth/policies.guard';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CertsService } from './certs.service';
import { PresignPhotoDto } from './dto/presign-photo.dto';
import { RegisterPhotoDto } from './dto/register-photo.dto';

@Controller('certs/:certNumber/photos')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class PhotosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certs: CertsService,
  ) {}

  private async findCert(certNumber: string) {
    const cert = await this.prisma.cert.findUnique({ where: { certNumber } });
    if (!cert) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    return cert;
  }

  @Post('presign')
  @CheckPolicies((ability) => ability.can('create', 'CertPhoto'))
  async presign(@Param('certNumber') certNumber: string, @Body() dto: PresignPhotoDto) {
    const cert = await this.findCert(certNumber);
    const objectKey = `certs/${cert.id}/${randomUUID()}`;
    const uploadUrl = await this.storage.presignPut(objectKey, dto.contentType);
    return { uploadUrl, objectKey };
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'CertPhoto'))
  async register(@Param('certNumber') certNumber: string, @Body() dto: RegisterPhotoDto) {
    const cert = await this.findCert(certNumber);
    if (!dto.objectKey.startsWith(`certs/${cert.id}/`)) {
      throw new BadRequestException('objectKey does not belong to this cert');
    }
    if (!(await this.storage.objectExists(dto.objectKey))) {
      throw new BadRequestException('No uploaded object at that key');
    }
    const photo = await this.prisma.certPhoto.create({
      data: {
        certId: cert.id,
        objectKey: dto.objectKey,
        contentType: 'application/octet-stream',
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return {
      id: photo.id,
      url: `${this.certs.publicUrlBase()}/${photo.objectKey}`,
      sortOrder: photo.sortOrder,
    };
  }

  @Delete(':photoId')
  @HttpCode(204)
  @CheckPolicies((ability) => ability.can('delete', 'CertPhoto'))
  async remove(
    @Param('certNumber') certNumber: string,
    @Param('photoId') photoId: string,
  ) {
    const cert = await this.findCert(certNumber);
    const photo = await this.prisma.certPhoto.findFirst({
      where: { id: photoId, certId: cert.id },
    });
    if (!photo) {
      throw new NotFoundException('No such photo on this cert');
    }
    await this.prisma.certPhoto.delete({ where: { id: photo.id } });
    await this.storage.deleteObject(photo.objectKey); // best-effort
  }
}
```

Note: store the real content type — change `contentType: 'application/octet-stream'` to carry the actual type through registration. `RegisterPhotoDto` deliberately does NOT trust the client for this; instead, read it from storage. Amend `StorageService.objectExists` to return the head result's content type, and use it. Replace `objectExists` with:

```ts
  /** Returns the object's content type, or null when the object does not exist. */
  async headContentType(objectKey: string): Promise<string | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return head.ContentType ?? 'application/octet-stream';
    } catch {
      return null;
    }
  }
```

and in the controller's `register`:

```ts
    const contentType = await this.storage.headContentType(dto.objectKey);
    if (contentType === null) {
      throw new BadRequestException('No uploaded object at that key');
    }
    const photo = await this.prisma.certPhoto.create({
      data: {
        certId: cert.id,
        objectKey: dto.objectKey,
        contentType,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
```

(`objectExists` is then unused — do not add it; implement `headContentType` only.)

Wire up: `apps/api/src/certs/certs.module.ts` — add `StorageModule` to imports and `PhotosController` to controllers:

```ts
import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { StorageModule } from '../storage/storage.module';
import { CertsController } from './certs.controller';
import { CertsService } from './certs.service';
import { PhotosController } from './photos.controller';

@Module({
  imports: [CardsModule, StorageModule],
  controllers: [CertsController, PhotosController],
  providers: [CertsService],
})
export class CertsModule {}
```

- [ ] **Step 6: Run e2e to verify green**

Run: `pnpm test:e2e`
Expected: all pass, including the real-MinIO round trip. Capture verbatim output.

- [ ] **Step 7: Commit**

```bash
git add apps/api docker-compose.yml
git commit -m "feat: photo presign/register/delete via S3-compatible storage"
```

---

### Task 9: Public lookup and catalog endpoints

**Files:**
- Modify: `packages/shared/src/domain.ts` (+ `CertListDto`)
- Modify: `packages/shared/src/domain.test.ts`
- Modify: `apps/api/src/certs/certs.service.ts`
- Modify: `apps/api/src/certs/certs.controller.ts`
- Create: `apps/api/src/certs/dto/list-certs.query.ts`
- Test: `apps/api/test/certs-public.e2e-spec.ts`

**Interfaces:**
- Consumes: everything above; `isValidCertNumber` from shared.
- Produces (the web app in Phase 4 consumes these):
  - Shared: `interface CertListDto { items: CertDto[]; page: number; pageSize: number; total: number }`.
  - `GET /certs/:certNumber` (PUBLIC) → `CertDto`; 404 for unknown or format-invalid numbers.
  - `GET /certs?q=&page=&pageSize=` (PUBLIC) → `CertListDto`, newest first; `q` matches certNumber exactly or cardName/setName case-insensitive substring; `page` ≥ 1 (default 1), `pageSize` 1–100 (default 20).

- [ ] **Step 1: Add CertListDto to shared (test first)**

Append to `packages/shared/src/domain.test.ts`:

```ts
import type { CertListDto } from './domain';

describe('CertListDto', () => {
  it('wraps items with pagination', () => {
    const list: CertListDto = { items: [], page: 1, pageSize: 20, total: 0 };
    expect(list.total).toBe(0);
  });
});
```

(Move the `import type` to the top of the file with the existing imports.)

Run `pnpm --filter @macgrading/shared test` → FAIL (no export). Then append to `packages/shared/src/domain.ts`:

```ts
export interface CertListDto {
  items: CertDto[];
  page: number;
  pageSize: number;
  total: number;
}
```

Run `pnpm --filter @macgrading/shared test` → PASS. Then `pnpm --filter @macgrading/shared build`.

- [ ] **Step 2: Write the failing e2e**

`apps/api/test/certs-public.e2e-spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { GOOGLE_TOKEN_VERIFIER } from './../src/auth/google-token-verifier';
import { resetDb } from './setup/test-db';

describe('public cert endpoints', () => {
  let app: INestApplication;
  let token: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
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
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({
      data: { email: 'team@macgrading.com', name: 'Team', role: 'TEAM_MEMBER' },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'team@macgrading.com' });
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const mintOne = async (cardboardTensId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/certs')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardboardTensId, isPrototype: false });
    return res.body.certNumber as string;
  };

  it('looks up a cert with no auth', async () => {
    const certNumber = await mintOne('cbt-0001');
    const res = await request(app.getHttpServer()).get(`/certs/${certNumber}`).expect(200);
    expect(res.body).toMatchObject({
      certNumber,
      cardName: 'Charizard',
      status: 'PENDING_GRADE',
    });
    expect(res.body).not.toHaveProperty('id');
  });

  it('404s cleanly for unknown and malformed numbers', async () => {
    await request(app.getHttpServer()).get('/certs/999999999').expect(404);
    await request(app.getHttpServer()).get('/certs/not-a-cert').expect(404);
  });

  it('lists newest first with pagination', async () => {
    const first = await mintOne('cbt-0001');
    const second = await mintOne('cbt-0002');
    const res = await request(app.getHttpServer()).get('/certs').expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.items.map((c: { certNumber: string }) => c.certNumber)).toEqual([
      second,
      first,
    ]);

    const paged = await request(app.getHttpServer())
      .get('/certs?page=2&pageSize=1')
      .expect(200);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.items[0].certNumber).toBe(first);
  });

  it('searches by card name fragment and exact cert number', async () => {
    const charizard = await mintOne('cbt-0001');
    await mintOne('cbt-0004');

    const byName = await request(app.getHttpServer()).get('/certs?q=chari').expect(200);
    expect(byName.body.total).toBe(1);
    expect(byName.body.items[0].cardName).toBe('Charizard');

    const byNumber = await request(app.getHttpServer())
      .get(`/certs?q=${charizard}`)
      .expect(200);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.items[0].certNumber).toBe(charizard);
  });

  it('rejects bad pagination', async () => {
    await request(app.getHttpServer()).get('/certs?page=0').expect(400);
    await request(app.getHttpServer()).get('/certs?pageSize=500').expect(400);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test:e2e`
Expected: public spec FAILs. Capture output.

- [ ] **Step 4: Implement**

`apps/api/src/certs/dto/list-certs.query.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCertsQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
```

Add to `apps/api/src/certs/certs.service.ts` (new imports: `CertListDto`, `isValidCertNumber` from shared; `Prisma` already imported for Task 7):

```ts
  async getByNumber(certNumber: string): Promise<CertDto> {
    if (!isValidCertNumber(certNumber)) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    const cert = await this.prisma.cert.findUnique({
      where: { certNumber },
      include: { photos: true },
    });
    if (!cert) {
      throw new NotFoundException(`No cert ${certNumber}`);
    }
    return toCertDto(cert, this.publicUrlBase());
  }

  async list(query: { q?: string; page: number; pageSize: number }): Promise<CertListDto> {
    const where: Prisma.CertWhereInput = query.q
      ? {
          OR: [
            { certNumber: query.q },
            { cardName: { contains: query.q, mode: 'insensitive' } },
            { setName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cert.count({ where }),
      this.prisma.cert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { photos: true },
      }),
    ]);
    const base = this.publicUrlBase();
    return {
      items: rows.map((row) => toCertDto(row, base)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
```

Add to `apps/api/src/certs/certs.controller.ts` (new imports: `Get`, `Query`; `ListCertsQuery`). Route order matters — `@Get()` and `@Get(':certNumber')` are public (no guards):

```ts
  @Get()
  list(@Query() query: ListCertsQuery) {
    return this.certs.list(query);
  }

  @Get(':certNumber')
  getByNumber(@Param('certNumber') certNumber: string) {
    return this.certs.getByNumber(certNumber);
  }
```

- [ ] **Step 5: Run all suites**

Run: `pnpm build && pnpm test && pnpm test:e2e`
Expected: everything green across the repo. Capture verbatim output.

- [ ] **Step 6: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat: public cert lookup and searchable catalog endpoints"
```

---

## Phase 2 exit criteria

- `pnpm build && pnpm test && pnpm test:e2e` green from the repo root (docker stack running).
- A seeded team member can (via curl or e2e): exchange a (faked) Google token → search cards → mint `000000001` → grade it "10 — Mac Daddy" → presign/upload/register a photo → and anyone can `GET /certs/000000001` unauthenticated and see all of it.
- Concurrency e2e proves gapless sequential minting under parallel load.
- Prototype and standard sequences are independent (`P000000001` vs `000000001`).
- The enum-drift guard and `test:e2e` turbo task (Phase 1 carried items) are in place.

Phase 3 (mobile app) gets its own plan once this lands.
