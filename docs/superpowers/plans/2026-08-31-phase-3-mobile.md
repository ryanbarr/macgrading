# MAC Grading Phase 3: Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the team-only Expo app — sign-in (Google + env-gated dev auth), cert list/search, the mint→grade→photos workflow — plus the three carried API items (P2002→409, typed presign response, dev token verifier).

**Architecture:** `apps/mobile` (Expo + expo-router + TanStack Query) talks only to the team API using DTOs from `@macgrading/shared`. Auth: native Google sign-in OR a dev email form (visible only when `EXPO_PUBLIC_DEV_AUTH=true`) — both produce a token POSTed to `/auth/google`; the API's verifier is swapped to a dev implementation only when `AUTH_DEV_MODE=true`. JWT lives in expo-secure-store. Each screen boundary is an API state transition, so the flow is resumable from Home.

**Tech Stack:** Expo (latest SDK, default template), expo-router, @tanstack/react-query v5, expo-secure-store, expo-image-picker, expo-clipboard, @react-native-google-signin/google-signin, jest-expo.

**Spec:** `docs/superpowers/specs/2026-08-31-mac-grading-design.md`

## Global Constraints

- The mobile app never talks to Postgres, MinIO (except presigned PUTs), or CardboardTens — only the API. All wire types come from `@macgrading/shared`; no locally redefined DTOs.
- `certNumber` is the only cert identifier used in navigation and API calls.
- Wireframe styling only: neutral grays, system fonts, plain React Native components. No UI kits, no brand colors.
- API base URL from `EXPO_PUBLIC_API_URL`, default `http://localhost:3001` (works on the iOS simulator). Dev auth UI only when `EXPO_PUBLIC_DEV_AUTH=true`.
- The API's dev verifier activates ONLY when `AUTH_DEV_MODE=true` (optional env, off by default, loud boot warning). It must never be enabled in any committed default.
- Zero-cost constraint: local builds (`npx expo run:ios`), no EAS services.
- Verification without a device: `tsc --noEmit` (typecheck), jest-expo unit tests for logic (API client, photo upload), and `npx expo export --platform ios` (proves Metro bundles and resolves `@macgrading/shared`). Manual simulator testing is the user's step, not a task gate.
- Grades: whole numbers 1–10 in the UI for now (API accepts one decimal place; UI stays decimal-ready by sending strings).
- Photo content types offered by the picker flow: from shared `ALLOWED_PHOTO_TYPES`.
- API changes follow existing API conventions (TDD with verbatim RED/GREEN transcripts, supertest default import). Mobile tasks: test-first for pure logic; screens are typecheck + bundle + (thin) component-free logic tests — capture command outputs verbatim.
- Commit after every green cycle.

---

### Task 1: Carried API items — 409 on duplicate photo, typed presign, dev verifier

**Files:**
- Modify: `apps/api/src/certs/photos.controller.ts`
- Create: `apps/api/src/auth/dev-token-verifier.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/config/env.validation.ts`
- Modify: `apps/api/test/certs-photos.e2e-spec.ts`
- Test: `apps/api/src/auth/dev-token-verifier.spec.ts`
- Modify: `.env.example` (and mirror `AUTH_DEV_MODE=true` into the gitignored `apps/api/.env`)

**Interfaces:**
- Consumes: existing `GoogleTokenVerifier` interface + `GOOGLE_TOKEN_VERIFIER` token, `PresignResponseDto` from shared (currently unwired), `HttpExceptionFilter`.
- Produces:
  - `POST /certs/:certNumber/photos` returns **409** (ConflictException) when the objectKey is already registered (previously an opaque 500 from P2002).
  - `presign()` return type is `Promise<PresignResponseDto>` (no behavior change).
  - `DevGoogleTokenVerifier` — `verify(idToken)` → `{ email: idToken lowercased/trimmed, googleId: 'dev-' + email, name: local part }`. Selected by AuthModule factory when `ConfigService.get('AUTH_DEV_MODE') === 'true'`; logs `AUTH_DEV_MODE enabled — Google tokens are NOT being verified` at warn level on construction.
  - Mobile Task 4 relies on: with `AUTH_DEV_MODE=true` in the API's env, `POST /auth/google { idToken: "you@example.com" }` logs in any active allowlisted user.

- [ ] **Step 1: Write the failing unit test for the dev verifier**

`apps/api/src/auth/dev-token-verifier.spec.ts`:

```ts
import { DevGoogleTokenVerifier } from './dev-token-verifier';

describe('DevGoogleTokenVerifier', () => {
  const verifier = new DevGoogleTokenVerifier();

  it('treats the token as an email and derives a profile', async () => {
    await expect(verifier.verify('  Team@MacGrading.com ')).resolves.toEqual({
      email: 'team@macgrading.com',
      googleId: 'dev-team@macgrading.com',
      name: 'team',
    });
  });

  it('rejects tokens that are not email-shaped', async () => {
    await expect(verifier.verify('not-an-email')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Update the duplicate-register e2e to demand 409**

In `apps/api/test/certs-photos.e2e-spec.ts`, find the existing duplicate-registration test (added in the Phase 2 fix wave; it asserts the second register is non-201/500). Change it to assert **409** exactly:

```ts
    const duplicate = await request(app.getHttpServer())
      .post(`/certs/${certNumber}/photos`)
      .set(authed())
      .send({ objectKey })
      .expect(409);
    expect(duplicate.body.message).toContain('already registered');
```

(Adapt variable names to the existing test's shape; keep its setup.)

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm --filter @macgrading/api test` (unit — module not found) and `pnpm test:e2e` (409 test gets 500).
Expected: FAIL for the named reasons. Capture verbatim transcripts.

- [ ] **Step 4: Implement**

`apps/api/src/auth/dev-token-verifier.ts`:

```ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { GoogleProfile, GoogleTokenVerifier } from './google-token-verifier';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Development-only verifier: treats the submitted "idToken" as an email
 * address. Selected ONLY when AUTH_DEV_MODE=true. Real Google verification
 * is bypassed entirely — never enable outside local development.
 */
@Injectable()
export class DevGoogleTokenVerifier implements GoogleTokenVerifier {
  private readonly logger = new Logger(DevGoogleTokenVerifier.name);

  constructor() {
    this.logger.warn(
      'AUTH_DEV_MODE enabled — Google tokens are NOT being verified',
    );
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    const email = idToken.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) {
      throw new UnauthorizedException('Invalid Google token');
    }
    return {
      email,
      googleId: `dev-${email}`,
      name: email.split('@')[0],
    };
  }
}
```

In `apps/api/src/auth/auth.module.ts`, replace the verifier provider with a factory:

```ts
import { ConfigService } from '@nestjs/config';
import { DevGoogleTokenVerifier } from './dev-token-verifier';
// existing imports stay

    {
      provide: GOOGLE_TOKEN_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('AUTH_DEV_MODE') === 'true'
          ? new DevGoogleTokenVerifier()
          : new GoogleAuthTokenVerifier(config),
    },
```

In `apps/api/src/config/env.validation.ts`, add:

```ts
  @IsOptional() @IsString() AUTH_DEV_MODE?: string;
```

In `apps/api/src/certs/photos.controller.ts`: type `presign()`'s return as `Promise<PresignResponseDto>` (import from `@macgrading/shared`) and wrap the `certPhoto.create` call:

```ts
import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common'; // merge into existing import

    let photo;
    try {
      photo = await this.prisma.certPhoto.create({
        data: {
          certId: cert.id,
          objectKey: dto.objectKey,
          contentType,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('That upload is already registered');
      }
      throw error;
    }
```

Append to `.env.example`:

```
# Dev-only: accept any email as a login token (NEVER enable in production)
# AUTH_DEV_MODE=true
```

Add `AUTH_DEV_MODE=true` (uncommented) to the gitignored `apps/api/.env` on this machine.

- [ ] **Step 5: Run everything green**

Run: `pnpm --filter @macgrading/api test && pnpm build && pnpm test:e2e`
Expected: all pass; 409 test green. Capture verbatim GREEN transcripts.

- [ ] **Step 6: Commit**

```bash
git add apps/api .env.example
git commit -m "feat: dev auth verifier, 409 on duplicate photo, typed presign"
```

---

### Task 2: Expo app scaffold in the monorepo

**Files:**
- Create: `apps/mobile/` (via create-expo-app, then adjusted)
- Modify: `apps/mobile/package.json`, `apps/mobile/app.json`
- Create: `apps/mobile/metro.config.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: workspace layout, `@macgrading/shared` (built CJS in dist).
- Produces: `@macgrading/mobile` package with scripts `dev` (expo start), `ios` (expo run:ios), `typecheck` (tsc --noEmit), `test` (jest — real config lands in Task 3; until then `jest --passWithNoTests`); Metro resolves `@macgrading/shared`; `npx expo export --platform ios` succeeds. All later tasks put screens in `apps/mobile/app/` and logic in `apps/mobile/src/`.

- [ ] **Step 1: Generate the app**

Run from repo root: `pnpm create expo-app@latest apps/mobile --no-install`
(Default template: TypeScript + expo-router.)

- [ ] **Step 2: Adjust package.json and app.json**

Merge into `apps/mobile/package.json` (keep generated deps/scripts; the generated name field becomes `@macgrading/mobile`):

```json
{
  "name": "@macgrading/mobile",
  "private": true,
  "scripts": {
    "dev": "expo start",
    "ios": "expo run:ios",
    "typecheck": "tsc --noEmit",
    "test": "jest --passWithNoTests"
  },
  "dependencies": {
    "@macgrading/shared": "workspace:*"
  }
}
```

In `apps/mobile/app.json` set `expo.name` to `MAC Grading`, `expo.slug` to `macgrading`, `expo.ios.bundleIdentifier` to `com.macgrading.app`, and `expo.scheme` to `macgrading`.

- [ ] **Step 3: Reset the example screens and add metro config**

Run the template's reset script if present (`npm run reset-project` inside apps/mobile) or delete the example screens so `app/` contains only `_layout.tsx` and `index.tsx` placeholders.

`apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
module.exports = config;
```

Replace `apps/mobile/app/index.tsx` with a smoke screen that proves the shared package resolves through Metro:

```tsx
import { isValidCertNumber } from '@macgrading/shared';
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>MAC Grading — shared linked: {String(isValidCertNumber('000000001'))}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Install and verify**

Run: `pnpm install && pnpm --filter @macgrading/mobile typecheck`
Expected: clean typecheck.

Run: `cd apps/mobile && npx expo export --platform ios && cd ../..`
Expected: bundle succeeds (dist/ output inside apps/mobile — add `apps/mobile/dist/` to root `.gitignore` if not covered by the existing `dist/` pattern; verify with `git status`).

Run: `pnpm test` (turbo)
Expected: mobile's `--passWithNoTests` passes alongside existing packages.

- [ ] **Step 5: README**

Add to `README.md` under the app list: `apps/mobile` line already exists — update Setup with:

```markdown
Mobile app (iOS simulator; needs Xcode):

    pnpm --filter @macgrading/mobile ios

Dev sign-in: set AUTH_DEV_MODE=true in apps/api/.env and EXPO_PUBLIC_DEV_AUTH=true
when starting expo, then sign in with a seeded team email.
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile README.md pnpm-lock.yaml .gitignore
git commit -m "feat: scaffold expo mobile app in monorepo"
```

---

### Task 3: Mobile foundation — API client, token storage, auth context, query setup

**Files:**
- Create: `apps/mobile/src/api/client.ts`
- Create: `apps/mobile/src/auth/token-storage.ts`
- Create: `apps/mobile/src/auth/auth-context.tsx`
- Create: `apps/mobile/src/theme.ts`
- Modify: `apps/mobile/package.json` (deps + jest config)
- Test: `apps/mobile/src/api/client.test.ts`, `apps/mobile/src/auth/token-storage.test.ts`

**Interfaces:**
- Consumes: shared DTOs (`LoginResponseDto`, `AuthUserDto`), Task 2 scaffold.
- Produces (all screens rely on these):
  - `ApiError` class with `status: number` and `message`.
  - `apiFetch<T>(path: string, options?: { method?: string; body?: unknown; token?: string | null }): Promise<T>` — base URL from `EXPO_PUBLIC_API_URL` ?? `http://localhost:3001`; JSON in/out; throws `ApiError` on non-2xx (message from response body when present); returns `undefined as T` for 204.
  - `tokenStorage`: `get(): Promise<string | null>`, `set(token: string): Promise<void>`, `clear(): Promise<void>` (expo-secure-store, key `macgrading.jwt`).
  - `AuthProvider` + `useAuth()`: `{ token: string | null; user: AuthUserDto | null; isLoading: boolean; signIn(idToken: string): Promise<void>; signOut(): Promise<void> }` — `signIn` POSTs `/auth/google`, stores the JWT, sets user; on mount restores the token and fetches `/auth/me` (clearing the token on 401).
  - `theme` object: `colors` (bg `#fafafa`, card `#ffffff`, border `#d4d4d4`, text `#171717`, subtle `#737373`, accent `#404040`, danger `#b91c1c`), `spacing(n) = n * 4`.
  - jest-expo configured; `pnpm --filter @macgrading/mobile test` runs real tests.

- [ ] **Step 1: Install dependencies**

Run: `pnpm --filter @macgrading/mobile add @tanstack/react-query expo-secure-store && pnpm --filter @macgrading/mobile add -D jest jest-expo @types/jest`

- [ ] **Step 2: Configure jest**

Add to `apps/mobile/package.json`:

```json
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/.pnpm/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg))"
    ]
  }
```

and change the `test` script to `"jest"`. (pnpm's `.pnpm` store layout needs this pattern shape; if module transform errors persist, extend the pattern with the failing package's name and note it in your report.)

- [ ] **Step 3: Write the failing tests**

`apps/mobile/src/api/client.test.ts`:

```ts
import { ApiError, apiFetch } from './client';

describe('apiFetch', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('GETs JSON with a bearer token', async () => {
    const mock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    global.fetch = mock as unknown as typeof fetch;
    const result = await apiFetch<{ ok: boolean }>('/health', { token: 'tok' });
    expect(result).toEqual({ ok: true });
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toMatch(/\/health$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('POSTs a JSON body', async () => {
    const mock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 201 }),
    );
    global.fetch = mock as unknown as typeof fetch;
    await apiFetch('/certs', { method: 'POST', body: { a: 1 }, token: 't' });
    const [, init] = mock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws ApiError with the server message on non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: 'already graded' }), {
        status: 409,
      }),
    ) as unknown as typeof fetch;
    await expect(apiFetch('/x')).rejects.toMatchObject({
      status: 409,
      message: 'already graded',
    });
  });

  it('returns undefined for 204', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
```

`apps/mobile/src/auth/token-storage.test.ts`:

```ts
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

import { tokenStorage } from './token-storage';

describe('tokenStorage', () => {
  it('round-trips and clears the token', async () => {
    await expect(tokenStorage.get()).resolves.toBeNull();
    await tokenStorage.set('jwt-value');
    await expect(tokenStorage.get()).resolves.toBe('jwt-value');
    await tokenStorage.clear();
    await expect(tokenStorage.get()).resolves.toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @macgrading/mobile test`
Expected: FAIL — modules not found. Capture verbatim.

- [ ] **Step 5: Implement**

`apps/mobile/src/api/client.ts`:

```ts
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
      }
    } catch {
      // non-JSON error body; keep the default message
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
```

`apps/mobile/src/auth/token-storage.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

const KEY = 'macgrading.jwt';

export const tokenStorage = {
  get: (): Promise<string | null> => SecureStore.getItemAsync(KEY),
  set: (token: string): Promise<void> => SecureStore.setItemAsync(KEY, token),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(KEY),
};
```

`apps/mobile/src/theme.ts`:

```ts
export const theme = {
  colors: {
    bg: '#fafafa',
    card: '#ffffff',
    border: '#d4d4d4',
    text: '#171717',
    subtle: '#737373',
    accent: '#404040',
    danger: '#b91c1c',
  },
  spacing: (n: number) => n * 4,
};
```

`apps/mobile/src/auth/auth-context.tsx`:

```tsx
import type { AuthUserDto, LoginResponseDto } from '@macgrading/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiFetch } from '../api/client';
import { tokenStorage } from './token-storage';

interface AuthState {
  token: string | null;
  user: AuthUserDto | null;
  isLoading: boolean;
  signIn: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await tokenStorage.get();
      if (!stored) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const me = await apiFetch<AuthUserDto>('/auth/me', { token: stored });
        if (!cancelled) {
          setToken(stored);
          setUser(me);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await tokenStorage.clear();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    const result = await apiFetch<LoginResponseDto>('/auth/google', {
      method: 'POST',
      body: { idToken },
    });
    await tokenStorage.set(result.accessToken);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await tokenStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, isLoading, signIn, signOut }),
    [token, user, isLoading, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
```

- [ ] **Step 6: Run green + typecheck + commit**

Run: `pnpm --filter @macgrading/mobile test && pnpm --filter @macgrading/mobile typecheck`
Expected: all pass. Capture verbatim.

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat: mobile api client, secure token storage, auth context"
```

---

### Task 4: Sign-in screen + navigation shell

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/sign-in.tsx`
- Create: `apps/mobile/app/(app)/_layout.tsx`
- Move/Modify: `apps/mobile/app/index.tsx` → `apps/mobile/app/(app)/index.tsx` (placeholder; Task 5 replaces it)
- Create: `apps/mobile/src/auth/google-sign-in.ts`
- Modify: `apps/mobile/app.json`, `apps/mobile/package.json`

**Interfaces:**
- Consumes: `AuthProvider`/`useAuth`, `theme`, Task 1's dev verifier (API side).
- Produces: route guard — unauthenticated users see `/sign-in`; authenticated land in the `(app)` group. `signInWithGoogle(): Promise<string>` returns a Google idToken or throws a friendly error when unconfigured. Screens in later tasks live under `app/(app)/` and can assume `useAuth().token` is set.

- [ ] **Step 1: Install Google sign-in**

Run: `pnpm --filter @macgrading/mobile add @react-native-google-signin/google-signin`

Add the config plugin to `apps/mobile/app.json` (`expo.plugins`):

```json
    "plugins": ["@react-native-google-signin/google-signin"]
```

(Real iOS client IDs arrive later; the code guards the unconfigured state.)

- [ ] **Step 2: Implement the Google wrapper**

`apps/mobile/src/auth/google-sign-in.ts`:

```ts
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/**
 * Returns a Google ID token, or throws with a human-readable message.
 * Requires EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and a dev build with the
 * google-signin plugin) — until then, use the dev sign-in path.
 */
export async function signInWithGoogle(): Promise<string> {
  if (!WEB_CLIENT_ID) {
    throw new Error(
      'Google sign-in is not configured yet (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID missing). Use dev sign-in.',
    );
  }
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google sign-in was cancelled or returned no token.');
  }
  return response.data.idToken;
}
```

- [ ] **Step 3: Root layout with providers and auth gate**

`apps/mobile/app/_layout.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/auth/auth-context';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

`apps/mobile/app/(app)/_layout.tsx`:

```tsx
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../src/auth/auth-context';
import { theme } from '../../src/theme';

export default function AppLayout() {
  const { token, isLoading } = useAuth();
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!token) {
    return <Redirect href="/sign-in" />;
  }
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: theme.colors.text,
        headerStyle: { backgroundColor: theme.colors.card },
      }}
    />
  );
}
```

- [ ] **Step 4: Sign-in screen**

`apps/mobile/app/sign-in.tsx`:

```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../src/auth/auth-context';
import { signInWithGoogle } from '../src/auth/google-sign-in';
import { theme } from '../src/theme';

const DEV_AUTH = process.env.EXPO_PUBLIC_DEV_AUTH === 'true';

export default function SignIn() {
  const { signIn } = useAuth();
  const [devEmail, setDevEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async (idToken: string) => {
    setBusy(true);
    try {
      await signIn(idToken);
      router.replace('/');
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MAC Grading</Text>
      <Text style={styles.subtitle}>Team sign-in</Text>

      <Pressable
        style={styles.button}
        disabled={busy}
        onPress={async () => {
          try {
            await finish(await signInWithGoogle());
          } catch (error) {
            Alert.alert(
              'Google sign-in',
              error instanceof Error ? error.message : 'Unknown error',
            );
          }
        }}
      >
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </Pressable>

      {DEV_AUTH && (
        <View style={styles.devBox}>
          <Text style={styles.devLabel}>Dev sign-in (AUTH_DEV_MODE)</Text>
          <TextInput
            style={styles.input}
            placeholder="team@macgrading.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={devEmail}
            onChangeText={setDevEmail}
          />
          <Pressable
            style={[styles.button, styles.devButton]}
            disabled={busy || devEmail.length < 3}
            onPress={() => finish(devEmail)}
          >
            <Text style={styles.buttonText}>Dev sign-in</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(6),
  },
  title: { fontSize: 32, fontWeight: '700', color: theme.colors.text },
  subtitle: {
    fontSize: 16,
    color: theme.colors.subtle,
    marginBottom: theme.spacing(8),
  },
  button: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(6),
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  devBox: {
    marginTop: theme.spacing(10),
    width: '100%',
    padding: theme.spacing(4),
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    gap: theme.spacing(3),
  },
  devLabel: { color: theme.colors.subtle, fontSize: 13 },
  devButton: { backgroundColor: theme.colors.subtle },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    padding: theme.spacing(3),
    backgroundColor: '#ffffff',
    color: theme.colors.text,
  },
});
```

Move the Task 2 smoke screen: `apps/mobile/app/(app)/index.tsx` (same content as the old `app/index.tsx`, plus a sign-out button so the gate is manually testable):

```tsx
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/auth-context';

export default function Home() {
  const { user, signOut } = useAuth();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text>Signed in as {user?.email}</Text>
      <Pressable onPress={signOut}>
        <Text style={{ textDecorationLine: 'underline' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
```

Delete the old `apps/mobile/app/index.tsx`.

- [ ] **Step 5: Verify**

Run: `pnpm --filter @macgrading/mobile typecheck && pnpm --filter @macgrading/mobile test`
Expected: clean.

Run: `cd apps/mobile && npx expo export --platform ios && cd ../..`
Expected: bundle succeeds (proves the new routes + google-signin import compile through Metro).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat: sign-in screen with google + dev auth, protected route group"
```

---

### Task 5: Home — cert list, search, status chips

**Files:**
- Create: `apps/mobile/src/api/queries.ts`
- Create: `apps/mobile/src/components/CertCard.tsx`
- Create: `apps/mobile/src/components/StatusChip.tsx`
- Rewrite: `apps/mobile/app/(app)/index.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `useAuth`, shared `CertDto`/`CertListDto`/`CertStatus`, theme.
- Produces (later tasks use these exact hooks):
  - `useCerts(q: string)` → query of `CertListDto` (`GET /certs?q=&pageSize=50`).
  - `useCert(certNumber: string)` → query of `CertDto`.
  - `useCardSearch(q: string)` → query of `CardSummary[]` (enabled when q.length >= 2).
  - `useGradeNames()` → query of `GradeNameDto[]`.
  - `useMintCert()`, `useSetGrade(certNumber)` mutations (invalidate `['certs']` and `['cert', certNumber]`).
  - `certKeys = { list: (q: string) => ['certs', q], detail: (n: string) => ['cert', n] }`.
  - `<CertCard cert={CertDto} onPress={() => ...} />`, `<StatusChip status={CertStatus} photoCount={number} />`.

- [ ] **Step 1: Implement the query hooks**

`apps/mobile/src/api/queries.ts`:

```ts
import type {
  CardSummary,
  CertDto,
  CertListDto,
  GradeNameDto,
} from '@macgrading/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { useAuth } from '../auth/auth-context';

export const certKeys = {
  list: (q: string) => ['certs', q] as const,
  detail: (certNumber: string) => ['cert', certNumber] as const,
};

export function useCerts(q: string) {
  return useQuery({
    queryKey: certKeys.list(q),
    queryFn: () =>
      apiFetch<CertListDto>(`/certs?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
}

export function useCert(certNumber: string) {
  return useQuery({
    queryKey: certKeys.detail(certNumber),
    queryFn: () => apiFetch<CertDto>(`/certs/${certNumber}`),
  });
}

export function useCardSearch(q: string) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['cards', q],
    queryFn: () =>
      apiFetch<CardSummary[]>(`/cards/search?q=${encodeURIComponent(q)}`, { token }),
    enabled: q.trim().length >= 2,
  });
}

export function useGradeNames() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['grade-names'],
    queryFn: () => apiFetch<GradeNameDto[]>('/grade-names', { token }),
  });
}

export function useMintCert() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cardboardTensId: string; isPrototype: boolean }) =>
      apiFetch<CertDto>('/certs', { method: 'POST', body: input, token }),
    onSuccess: (cert) => {
      queryClient.invalidateQueries({ queryKey: ['certs'] });
      queryClient.setQueryData(certKeys.detail(cert.certNumber), cert);
    },
  });
}

export function useSetGrade(certNumber: string) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grade: string) =>
      apiFetch<CertDto>(`/certs/${certNumber}/grade`, {
        method: 'PATCH',
        body: { grade },
        token,
      }),
    onSuccess: (cert) => {
      queryClient.invalidateQueries({ queryKey: ['certs'] });
      queryClient.setQueryData(certKeys.detail(cert.certNumber), cert);
    },
  });
}
```

- [ ] **Step 2: Components**

`apps/mobile/src/components/StatusChip.tsx`:

```tsx
import type { CertStatus } from '@macgrading/shared';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function StatusChip({
  status,
  photoCount,
}: {
  status: CertStatus;
  photoCount: number;
}) {
  const label = status === 'PENDING_GRADE' ? 'Needs grade' : 'Graded';
  return (
    <View style={styles.row}>
      <View style={[styles.chip, status === 'GRADED' && styles.chipDone]}>
        <Text style={styles.chipText}>{label}</Text>
      </View>
      <Text style={styles.photos}>
        {photoCount === 0 ? 'No photos' : `${photoCount} photo${photoCount === 1 ? '' : 's'}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  chip: {
    backgroundColor: '#e5e5e5',
    paddingHorizontal: theme.spacing(2),
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipDone: { backgroundColor: '#d4d4d4' },
  chipText: { fontSize: 12, color: theme.colors.text },
  photos: { fontSize: 12, color: theme.colors.subtle },
});
```

`apps/mobile/src/components/CertCard.tsx`:

```tsx
import type { CertDto } from '@macgrading/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { StatusChip } from './StatusChip';

export function CertCard({ cert, onPress }: { cert: CertDto; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.number}>{cert.certNumber}</Text>
        {cert.grade && (
          <Text style={styles.grade}>
            {cert.grade}
            {cert.gradeName ? ` · ${cert.gradeName}` : ''}
          </Text>
        )}
      </View>
      <Text style={styles.name}>{cert.cardName}</Text>
      <Text style={styles.set}>
        {cert.setName}
        {cert.releaseYear ? ` · ${cert.releaseYear}` : ''}
      </Text>
      <StatusChip status={cert.status} photoCount={cert.photos.length} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(4),
    gap: theme.spacing(1),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  number: { fontFamily: 'Menlo', fontSize: 15, color: theme.colors.text },
  grade: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  name: { fontSize: 17, fontWeight: '600', color: theme.colors.text },
  set: { fontSize: 13, color: theme.colors.subtle },
});
```

- [ ] **Step 3: Home screen**

`apps/mobile/app/(app)/index.tsx` (replaces the Task 4 placeholder):

```tsx
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCerts } from '../../src/api/queries';
import { useAuth } from '../../src/auth/auth-context';
import { CertCard } from '../../src/components/CertCard';
import { theme } from '../../src/theme';

export default function Home() {
  const { signOut } = useAuth();
  const [q, setQ] = useState('');
  const certs = useCerts(q);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Certs',
          headerRight: () => (
            <Pressable onPress={signOut}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          ),
        }}
      />
      <TextInput
        style={styles.search}
        placeholder="Search certs (name, set, number)"
        autoCapitalize="none"
        value={q}
        onChangeText={setQ}
      />
      <FlatList
        data={certs.data?.items ?? []}
        keyExtractor={(cert) => cert.certNumber}
        contentContainerStyle={styles.list}
        refreshing={certs.isFetching}
        onRefresh={() => certs.refetch()}
        renderItem={({ item }) => (
          <CertCard cert={item} onPress={() => router.push(`/cert/${item.certNumber}`)} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {certs.isLoading ? 'Loading…' : 'No certs yet.'}
          </Text>
        }
      />
      <Pressable style={styles.fab} onPress={() => router.push('/new-cert')}>
        <Text style={styles.fabText}>+ New Cert</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  signOut: { color: theme.colors.subtle, fontSize: 14 },
  search: {
    margin: theme.spacing(4),
    marginBottom: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: theme.spacing(3),
    backgroundColor: theme.colors.card,
  },
  list: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: 96 },
  empty: { textAlign: 'center', color: theme.colors.subtle, marginTop: theme.spacing(10) },
  fab: {
    position: 'absolute',
    bottom: theme.spacing(8),
    right: theme.spacing(6),
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(5),
  },
  fabText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter @macgrading/mobile typecheck && pnpm --filter @macgrading/mobile test && cd apps/mobile && npx expo export --platform ios && cd ../..`
Expected: all clean.

```bash
git add apps/mobile
git commit -m "feat: home cert list with search and status chips"
```

---

### Task 6: New-cert flow — card search, label preview, mint

**Files:**
- Create: `apps/mobile/app/(app)/new-cert/index.tsx`
- Create: `apps/mobile/app/(app)/new-cert/preview.tsx`
- Create: `apps/mobile/app/(app)/new-cert/created.tsx`
- Create: `apps/mobile/src/components/LabelPreview.tsx`

**Interfaces:**
- Consumes: `useCardSearch`, `useMintCert`, theme; expo-clipboard.
- Produces: flow `/new-cert` → `/new-cert/preview?card=<json>` → `/new-cert/created?certNumber=…` → `/cert/[certNumber]/grade`. `<LabelPreview card={CardSummary} certNumber={string | null} grade={string | null} gradeName={string | null} isPrototype={boolean} />` is reused by Task 8's detail screen.

- [ ] **Step 1: Install clipboard**

Run: `pnpm --filter @macgrading/mobile add expo-clipboard`

- [ ] **Step 2: Label preview component**

`apps/mobile/src/components/LabelPreview.tsx`:

```tsx
import type { CardSummary } from '@macgrading/shared';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface Props {
  card: CardSummary;
  certNumber: string | null;
  grade: string | null;
  gradeName: string | null;
  isPrototype: boolean;
}

/** Wireframe rendering of the physical MAC label. */
export function LabelPreview({ card, certNumber, grade, gradeName, isPrototype }: Props) {
  return (
    <View style={styles.label}>
      <View style={styles.top}>
        <Text style={styles.brand}>MAC GRADING</Text>
        {isPrototype && <Text style={styles.proto}>PROTOTYPE</Text>}
      </View>
      <Text style={styles.cardName}>{card.cardName}</Text>
      <Text style={styles.meta}>
        {card.setName}
        {card.cardNumber ? ` · ${card.cardNumber}` : ''}
        {card.releaseYear ? ` · ${card.releaseYear}` : ''}
      </Text>
      {card.category && <Text style={styles.meta}>{card.category}</Text>}
      <View style={styles.bottom}>
        <Text style={styles.cert}>{certNumber ?? '— pending —'}</Text>
        <Text style={styles.grade}>
          {grade ? `${grade}${gradeName ? ` ${gradeName.toUpperCase()}` : ''}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: theme.colors.text,
    borderRadius: 4,
    padding: theme.spacing(4),
    gap: 2,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  brand: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: theme.colors.text },
  proto: { fontSize: 11, fontWeight: '800', color: theme.colors.danger },
  cardName: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  meta: { fontSize: 12, color: theme.colors.subtle },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: theme.spacing(3),
  },
  cert: { fontFamily: 'Menlo', fontSize: 13, color: theme.colors.text },
  grade: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
});
```

- [ ] **Step 3: Card search screen**

`apps/mobile/app/(app)/new-cert/index.tsx`:

```tsx
import type { CardSummary } from '@macgrading/shared';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCardSearch } from '../../../src/api/queries';
import { theme } from '../../../src/theme';

export default function CardSearch() {
  const [q, setQ] = useState('');
  const search = useCardSearch(q);

  const select = (card: CardSummary) => {
    router.push({
      pathname: '/new-cert/preview',
      params: { card: JSON.stringify(card) },
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Find the card' }} />
      <TextInput
        style={styles.search}
        placeholder="Card name, set, or category"
        autoFocus
        autoCapitalize="none"
        value={q}
        onChangeText={setQ}
      />
      <FlatList
        data={search.data ?? []}
        keyExtractor={(card) => card.cardboardTensId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => select(item)}>
            <Text style={styles.name}>{item.cardName}</Text>
            <Text style={styles.meta}>
              {item.setName}
              {item.cardNumber ? ` · ${item.cardNumber}` : ''}
              {item.releaseYear ? ` · ${item.releaseYear}` : ''}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {q.trim().length < 2
              ? 'Type at least 2 characters to search CardboardTens.'
              : search.isFetching
                ? 'Searching…'
                : 'No cards found.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  search: {
    margin: theme.spacing(4),
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: theme.spacing(3),
    backgroundColor: theme.colors.card,
  },
  list: { paddingHorizontal: theme.spacing(4), gap: theme.spacing(2) },
  row: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(3),
  },
  name: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.subtle },
  empty: { textAlign: 'center', color: theme.colors.subtle, marginTop: theme.spacing(8) },
});
```

- [ ] **Step 4: Preview + confirm screen**

`apps/mobile/app/(app)/new-cert/preview.tsx`:

```tsx
import type { CardSummary } from '@macgrading/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useMintCert } from '../../../src/api/queries';
import { LabelPreview } from '../../../src/components/LabelPreview';
import { theme } from '../../../src/theme';

export default function Preview() {
  const params = useLocalSearchParams<{ card: string }>();
  const card = JSON.parse(params.card) as CardSummary;
  const [isPrototype, setIsPrototype] = useState(false);
  const mint = useMintCert();

  const confirm = () => {
    Alert.alert(
      'Mint certification?',
      `This permanently assigns the next ${isPrototype ? 'prototype ' : ''}number to “${card.cardName}”. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mint it',
          style: 'destructive',
          onPress: () => {
            mint.mutate(
              { cardboardTensId: card.cardboardTensId, isPrototype },
              {
                onSuccess: (cert) =>
                  router.replace({
                    pathname: '/new-cert/created',
                    params: { certNumber: cert.certNumber },
                  }),
                onError: (error) =>
                  Alert.alert('Mint failed', error.message),
              },
            );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Confirm label' }} />
      <LabelPreview
        card={card}
        certNumber={null}
        grade={null}
        gradeName={null}
        isPrototype={isPrototype}
      />
      <View style={styles.protoRow}>
        <Text style={styles.protoLabel}>Prototype</Text>
        <Switch value={isPrototype} onValueChange={setIsPrototype} />
      </View>
      <Text style={styles.warning}>
        Check every detail — confirming mints a permanent sequential number.
      </Text>
      <Pressable style={styles.button} disabled={mint.isPending} onPress={confirm}>
        <Text style={styles.buttonText}>
          {mint.isPending ? 'Minting…' : 'Details are correct — mint cert'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(4), gap: theme.spacing(4) },
  protoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(3),
  },
  protoLabel: { fontSize: 16, color: theme.colors.text },
  warning: { color: theme.colors.subtle, fontSize: 13 },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 5: Created screen**

`apps/mobile/app/(app)/new-cert/created.tsx`:

```tsx
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../../src/theme';

export default function Created() {
  const { certNumber } = useLocalSearchParams<{ certNumber: string }>();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Cert minted', headerBackVisible: false }} />
      <Text style={styles.caption}>Certification number</Text>
      <Pressable
        onPress={async () => {
          await Clipboard.setStringAsync(certNumber);
        }}
      >
        <Text style={styles.number}>{certNumber}</Text>
        <Text style={styles.hint}>Tap to copy — enter it in the label printer</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => router.replace(`/cert/${certNumber}/grade`)}
      >
        <Text style={styles.buttonText}>Enter the grade</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(6),
    gap: theme.spacing(4),
  },
  caption: { fontSize: 14, color: theme.colors.subtle },
  number: {
    fontFamily: 'Menlo',
    fontSize: 40,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  hint: { fontSize: 12, color: theme.colors.subtle, textAlign: 'center', marginTop: 4 },
  button: {
    marginTop: theme.spacing(6),
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing(4),
    paddingHorizontal: theme.spacing(8),
  },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @macgrading/mobile typecheck && pnpm --filter @macgrading/mobile test && cd apps/mobile && npx expo export --platform ios && cd ../..`
Expected: clean.

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat: new-cert flow — card search, label preview, mint, created screen"
```

---

### Task 7: Grade entry

**Files:**
- Create: `apps/mobile/app/(app)/cert/[certNumber]/grade.tsx`
- Create: `apps/mobile/src/components/GradePicker.tsx`

**Interfaces:**
- Consumes: `useGradeNames`, `useSetGrade`, `useCert`, theme.
- Produces: `/cert/[certNumber]/grade` — whole-number picker 1–10 showing the configured name live; confirm PATCHes the grade and replaces the route with `/cert/[certNumber]`. `<GradePicker value grade names onSelect />`.

- [ ] **Step 1: Grade picker component**

`apps/mobile/src/components/GradePicker.tsx`:

```tsx
import type { GradeNameDto } from '@macgrading/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

const WHOLE_GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

interface Props {
  value: string | null;
  gradeNames: GradeNameDto[];
  onSelect: (grade: string) => void;
}

export function GradePicker({ value, gradeNames, onSelect }: Props) {
  const nameFor = (grade: string) =>
    gradeNames.find((entry) => Number(entry.gradeValue) === Number(grade))?.name ?? null;

  return (
    <View style={styles.grid}>
      {WHOLE_GRADES.map((grade) => {
        const selected = value === grade;
        return (
          <Pressable
            key={grade}
            style={[styles.cell, selected && styles.cellSelected]}
            onPress={() => onSelect(grade)}
          >
            <Text style={[styles.gradeText, selected && styles.gradeTextSelected]}>
              {grade}
            </Text>
            {nameFor(grade) && (
              <Text style={[styles.nameText, selected && styles.gradeTextSelected]}>
                {nameFor(grade)}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cell: {
    width: '18%',
    minWidth: 64,
    aspectRatio: 1,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  cellSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  gradeText: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  gradeTextSelected: { color: '#ffffff' },
  nameText: { fontSize: 9, color: theme.colors.subtle, textAlign: 'center' },
});
```

- [ ] **Step 2: Grade screen**

`apps/mobile/app/(app)/cert/[certNumber]/grade.tsx`:

```tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCert, useGradeNames, useSetGrade } from '../../../../src/api/queries';
import { GradePicker } from '../../../../src/components/GradePicker';
import { theme } from '../../../../src/theme';

export default function GradeEntry() {
  const { certNumber } = useLocalSearchParams<{ certNumber: string }>();
  const cert = useCert(certNumber);
  const gradeNames = useGradeNames();
  const setGrade = useSetGrade(certNumber);
  const [selected, setSelected] = useState<string | null>(null);

  const selectedName = selected
    ? (gradeNames.data?.find((g) => Number(g.gradeValue) === Number(selected))?.name ?? null)
    : null;

  const confirm = () => {
    if (!selected) return;
    Alert.alert(
      'Confirm grade',
      `Grade ${selected}${selectedName ? ` — ${selectedName}` : ''} for ${certNumber}? Grades are frozen once saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save grade',
          style: 'destructive',
          onPress: () =>
            setGrade.mutate(selected, {
              onSuccess: () => router.replace(`/cert/${certNumber}`),
              onError: (error) => Alert.alert('Grading failed', error.message),
            }),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Grade ${certNumber}` }} />
      <Text style={styles.card}>{cert.data?.cardName ?? ''}</Text>
      <Text style={styles.prompt}>What did the dice say?</Text>
      <GradePicker
        value={selected}
        gradeNames={gradeNames.data ?? []}
        onSelect={setSelected}
      />
      <View style={styles.selectedBox}>
        <Text style={styles.selectedText}>
          {selected
            ? `${selected}${selectedName ? ` — ${selectedName}` : ' (no name configured yet)'}`
            : 'Pick a grade'}
        </Text>
      </View>
      <Pressable
        style={[styles.button, (!selected || setGrade.isPending) && styles.buttonDisabled]}
        disabled={!selected || setGrade.isPending}
        onPress={confirm}
      >
        <Text style={styles.buttonText}>
          {setGrade.isPending ? 'Saving…' : 'Confirm grade'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(4), gap: theme.spacing(4) },
  card: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  prompt: { fontSize: 14, color: theme.colors.subtle },
  selectedBox: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  selectedText: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter @macgrading/mobile typecheck && pnpm --filter @macgrading/mobile test && cd apps/mobile && npx expo export --platform ios && cd ../..`
Expected: clean.

```bash
git add apps/mobile
git commit -m "feat: grade entry with live grade names"
```

---

### Task 8: Cert detail + photo upload

**Files:**
- Create: `apps/mobile/src/photos/upload.ts`
- Create: `apps/mobile/app/(app)/cert/[certNumber]/index.tsx`
- Test: `apps/mobile/src/photos/upload.test.ts`

**Interfaces:**
- Consumes: `useCert`, `certKeys`, `apiFetch`, `LabelPreview`, shared `PresignResponseDto`/`CertPhotoDto`/`ALLOWED_PHOTO_TYPES`; expo-image-picker.
- Produces: `/cert/[certNumber]` detail screen (label, status, photo grid, add/delete photos, "Enter grade" button when PENDING_GRADE). `uploadCertPhoto(args: { certNumber: string; token: string; uri: string; mimeType: string; sortOrder: number }): Promise<CertPhotoDto>` — presign → PUT bytes → register.

- [ ] **Step 1: Install image picker**

Run: `pnpm --filter @macgrading/mobile add expo-image-picker`

Add to `apps/mobile/app.json` `expo.plugins` (merge with existing):

```json
    [
      "expo-image-picker",
      {
        "photosPermission": "MAC Grading attaches slab photos to certifications.",
        "cameraPermission": "MAC Grading photographs sealed slabs for certifications."
      }
    ]
```

- [ ] **Step 2: Write the failing upload test**

`apps/mobile/src/photos/upload.test.ts`:

```ts
import { uploadCertPhoto } from './upload';

describe('uploadCertPhoto', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('presigns, PUTs the bytes, then registers', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? 'GET' });
      if (u.endsWith('/photos/presign')) {
        return new Response(
          JSON.stringify({ uploadUrl: 'http://minio/put-here', objectKey: 'certs/c1/p1' }),
          { status: 201 },
        );
      }
      if (u === 'http://minio/put-here') {
        return new Response(null, { status: 200 });
      }
      if (u.startsWith('file://')) {
        return new Response(new Blob(['bytes'])); // local asset read
      }
      if (u.endsWith('/photos')) {
        return new Response(
          JSON.stringify({ id: 'p1', url: 'http://minio/certs/c1/p1', sortOrder: 0 }),
          { status: 201 },
        );
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    const photo = await uploadCertPhoto({
      certNumber: '000000001',
      token: 'tok',
      uri: 'file:///slab.jpg',
      mimeType: 'image/jpeg',
      sortOrder: 0,
    });

    expect(photo.id).toBe('p1');
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'PUT', 'POST']);
  });

  it('throws when the PUT fails and never registers', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/photos/presign')) {
        return new Response(
          JSON.stringify({ uploadUrl: 'http://minio/put-here', objectKey: 'k' }),
          { status: 201 },
        );
      }
      if (u.startsWith('file://')) {
        return new Response(new Blob(['bytes']));
      }
      if (u === 'http://minio/put-here') {
        return new Response(null, { status: 403 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as unknown as typeof fetch;

    await expect(
      uploadCertPhoto({
        certNumber: '000000001',
        token: 'tok',
        uri: 'file:///slab.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
      }),
    ).rejects.toThrow('Upload failed');
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement**

Run: `pnpm --filter @macgrading/mobile test` → FAIL (module not found). Capture verbatim.

`apps/mobile/src/photos/upload.ts`:

```ts
import type { CertPhotoDto, PresignResponseDto } from '@macgrading/shared';
import { apiFetch } from '../api/client';

interface UploadArgs {
  certNumber: string;
  token: string;
  uri: string;
  mimeType: string;
  sortOrder: number;
}

/** presign → PUT the local asset's bytes → register. Never registers a failed upload. */
export async function uploadCertPhoto(args: UploadArgs): Promise<CertPhotoDto> {
  const presign = await apiFetch<PresignResponseDto>(
    `/certs/${args.certNumber}/photos/presign`,
    { method: 'POST', body: { contentType: args.mimeType }, token: args.token },
  );

  const asset = await fetch(args.uri);
  const bytes = await asset.blob();
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': args.mimeType },
    body: bytes,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }

  return apiFetch<CertPhotoDto>(`/certs/${args.certNumber}/photos`, {
    method: 'POST',
    body: { objectKey: presign.objectKey, sortOrder: args.sortOrder },
    token: args.token,
  });
}
```

Run: `pnpm --filter @macgrading/mobile test` → PASS. Capture verbatim.

- [ ] **Step 4: Cert detail screen**

`apps/mobile/app/(app)/cert/[certNumber]/index.tsx`:

```tsx
import type { CardSummary } from '@macgrading/shared';
import { ALLOWED_PHOTO_TYPES } from '@macgrading/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../../src/api/client';
import { certKeys, useCert } from '../../../../src/api/queries';
import { useAuth } from '../../../../src/auth/auth-context';
import { LabelPreview } from '../../../../src/components/LabelPreview';
import { StatusChip } from '../../../../src/components/StatusChip';
import { uploadCertPhoto } from '../../../../src/photos/upload';
import { theme } from '../../../../src/theme';

export default function CertDetail() {
  const { certNumber } = useLocalSearchParams<{ certNumber: string }>();
  const cert = useCert(certNumber);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: certKeys.detail(certNumber) });
    queryClient.invalidateQueries({ queryKey: ['certs'] });
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    const picker =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsMultipleSelection: false });
    if (picker.canceled || !picker.assets[0]) return;
    const asset = picker.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(mimeType)) {
      Alert.alert('Unsupported format', `${mimeType} is not accepted.`);
      return;
    }
    setUploading(true);
    try {
      await uploadCertPhoto({
        certNumber,
        token: token!,
        uri: asset.uri,
        mimeType,
        sortOrder: cert.data?.photos.length ?? 0,
      });
      refresh();
    } catch (error) {
      Alert.alert('Photo upload failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = (photoId: string) => {
    Alert.alert('Delete photo?', 'The image is removed from the cert page.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch<void>(`/certs/${certNumber}/photos/${photoId}`, {
              method: 'DELETE',
              token,
            });
            refresh();
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  if (!cert.data) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: certNumber }} />
        <Text style={styles.subtle}>{cert.isLoading ? 'Loading…' : 'Cert not found.'}</Text>
      </View>
    );
  }

  const data = cert.data;
  const card: CardSummary = {
    cardboardTensId: data.cardboardTensId,
    cardName: data.cardName,
    setName: data.setName,
    cardNumber: data.cardNumber,
    releaseYear: data.releaseYear,
    category: data.category,
    cardImageUrl: data.cardImageUrl,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: data.certNumber }} />
      <LabelPreview
        card={card}
        certNumber={data.certNumber}
        grade={data.grade}
        gradeName={data.gradeName}
        isPrototype={data.isPrototype}
      />
      <StatusChip status={data.status} photoCount={data.photos.length} />

      {data.status === 'PENDING_GRADE' && (
        <Pressable
          style={styles.button}
          onPress={() => router.push(`/cert/${data.certNumber}/grade`)}
        >
          <Text style={styles.buttonText}>Enter the grade</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Slab photos</Text>
      <View style={styles.photoGrid}>
        {data.photos.map((photo) => (
          <Pressable key={photo.id} onLongPress={() => deletePhoto(photo.id)}>
            <Image source={{ uri: photo.url }} style={styles.photo} />
          </Pressable>
        ))}
        {data.photos.length === 0 && (
          <Text style={styles.subtle}>No photos yet — add them after sealing the slab.</Text>
        )}
      </View>
      <View style={styles.photoButtons}>
        <Pressable
          style={[styles.button, styles.buttonHalf]}
          disabled={uploading}
          onPress={() => addPhoto('camera')}
        >
          <Text style={styles.buttonText}>{uploading ? 'Uploading…' : 'Take photo'}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonHalf]}
          disabled={uploading}
          onPress={() => addPhoto('library')}
        >
          <Text style={styles.buttonText}>From library</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Long-press a photo to delete it.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4), paddingBottom: 64 },
  subtle: { color: theme.colors.subtle },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  photo: { width: 104, height: 104, borderRadius: 6, backgroundColor: '#e5e5e5' },
  photoButtons: { flexDirection: 'row', gap: theme.spacing(3) },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonHalf: { flex: 1 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: theme.colors.subtle },
});
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter @macgrading/mobile typecheck && pnpm --filter @macgrading/mobile test && cd apps/mobile && npx expo export --platform ios && cd ../..`
Expected: clean. Also run the repo-wide gates: `pnpm build && pnpm test && pnpm test:e2e` (API untouched since Task 1, but confirm nothing drifted).

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat: cert detail with slab photo capture, upload, delete"
```

---

## Phase 3 exit criteria

- `pnpm build && pnpm test && pnpm test:e2e` green (includes mobile typecheck-backed jest suite; API 409 + dev verifier tests).
- `npx expo export --platform ios` bundles the complete app (all routes, shared package resolved).
- With the API running (`AUTH_DEV_MODE=true`) and `EXPO_PUBLIC_DEV_AUTH=true`, the user can — on the iOS simulator — dev-sign-in as a seeded team member, search a stub card, preview the label, toggle Prototype, mint a real sequential number, copy it, enter a dice grade with live grade names, and attach/delete slab photos that then appear on the public `GET /certs/:certNumber`.
- Real Google sign-in is wired and activates the moment `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is supplied (until then it fails with a clear message).
- Manual simulator smoke-testing is the user's acceptance step; it is not gated by these tasks.

Phase 4 (web app) gets its own plan once this lands — carrying: enable CORS in the API, add @nestjs/throttler to public endpoints.
