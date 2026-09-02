# MAC Grading — System Design

**Date:** 2026-08-31
**Status:** Approved pending review
**Domain:** macgrading.com

## Overview

MAC Grading (Mostly Accurate Certifications) is a meme card grading company. At
shows, team members slab customers' trading cards with official-looking MAC
labels; grades are determined by the customer's dice roll. Each slab carries a
QR code linking to a permanent public certification page.

Three applications share one monorepo:

- **`apps/api`** — Nest.js. Single source of truth. Public cert lookup +
  authenticated team operations.
- **`apps/web`** — Next.js. Public marketing/lookup site.
- **`apps/mobile`** — Expo React Native. Team-only cert creation tool.
- **`packages/shared`** — cert-number format utilities, shared types/DTOs,
  CASL ability builder.

Deliberately out of scope: the label/QR printing application (separate
app/device), brand/visual design (neutral wireframe styling only), customer
accounts, payments.

## Decisions

| Topic | Decision |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (App Router), Tailwind, neutral wireframe styling |
| API | Nest.js |
| Mobile | Expo (local builds via `npx expo run:*` — no paid EAS; keep mobile costs ~zero) |
| Database | PostgreSQL + Prisma |
| Card catalog | CardboardTens API **stubbed** behind a `CardCatalogService` interface in the API; real integration swaps one Nest provider |
| Auth | Native Google sign-in → API verifies Google ID token → issues **our own JWT**; extensible to other identity providers later |
| Permissions | CASL, abilities derived from `User.role`, shared between API and mobile |
| Photo storage | S3-compatible bucket (Railway bucket in prod, MinIO in local docker-compose) |
| Hosting | Railway (api, web, Postgres, bucket) |
| Cert numbers | Nine digits with leading zeroes; prototype certs prefixed `P`. Two independent sequences: `000000001…` and `P000000001…` |
| Grades | `Decimal` (whole numbers in UI for now); every grade value has a configurable name (1 = "Lil' Mac", 10 = "Mac Daddy"; 2–9 named later) |

## Architecture

```
┌─────────────┐     ┌─────────────┐
│  apps/web    │     │ apps/mobile │
│  Next.js     │     │ Expo RN     │
│  (public)    │     │ (team only) │
└──────┬───────┘     └──────┬──────┘
       │  public REST        │  authed REST (our JWT)
       ▼                     ▼
┌────────────────────────────────────┐
│            apps/api (Nest.js)       │
│  CertsModule · CardsModule (stub)   │
│  GradesModule · AuthModule          │
│  StorageModule (S3 presign)         │
└───────┬──────────────┬─────────────┘
        ▼              ▼
   PostgreSQL     S3-compatible bucket
   (Prisma)       (slab photos)
```

- The web app has no database access; everything flows through the API so the
  QR permalink, the API, and the web page can never disagree.
- The mobile app never talks to CardboardTens directly; the API proxies (stub
  now, real later).
- Local dev: `docker-compose` with Postgres + MinIO.

## Data model

```prisma
User          id, email (unique), name, googleId?, role (ADMIN | TEAM_MEMBER),
              isActive, createdAt

Cert          id (uuid, internal only), certNumber (string, unique),
              isPrototype, status (PENDING_GRADE | GRADED),
              // card snapshot, copied from CardboardTens at mint time:
              cardboardTensId, cardName, setName, cardNumber?, releaseYear?,
              category?, cardImageUrl?,
              grade (Decimal?), gradeName (string?),   // frozen at grading time
              gradedById → User, gradedAt?, createdAt

CertPhoto     id, certId → Cert, objectKey, contentType, sortOrder, createdAt

CertCounter   type (STANDARD | PROTOTYPE, pk), nextValue

GradeName     gradeValue (Decimal, unique), name
```

Key rules:

- **Certs are append-mostly ledger records.** Card details are snapshotted at
  mint time; `cardboardTensId` is provenance only. Editing/deleting cards in
  CardboardTens never changes a cert.
- **Grade names freeze at grading time.** Renaming a grade later never rewrites
  what a physical label says. `GradeName` is the configurable lookup used at
  entry time.
- **`certNumber` is the only identifier the API exposes.** The uuid is a
  surrogate key for internal relations and never appears in URLs. QR code, web
  permalink, and API path all use `certNumber`.
- **`CertCounter` is a counter table, not a Postgres sequence.** Minting does
  `SELECT … FOR UPDATE` on the counter row, increments, and inserts the cert in
  one transaction — no gaps on rollback, which matters for a visibly sequential
  scheme.
- **Lifecycle (revised 2026-09-02 — late minting):** the normal flow mints the
  cert directly to `GRADED` — card and grade are both confirmed first, then the
  number, grade, and frozen grade name are written in one transaction. A cert
  is never observable half-minted. Grade-less minting (`PENDING_GRADE`, then
  `PATCH /grade`) remains supported for flexibility and legacy certs. Photos
  attach at any time after; a cert with zero photos is valid and public.

## API surface

Public (no auth):

```
GET    /certs                              recent + search (?q=, paginated)
GET    /certs/:certNumber                  cert lookup (404 if unknown)
```

Team (our JWT required, CASL-checked):

```
POST   /auth/google                        Google ID token → { accessToken, user }
GET    /auth/me                            current user + role

GET    /cards/search?q=                    CardCatalogService (stub) results
GET    /grade-names                        configured grade names

POST   /certs                              { cardboardTensId, isPrototype, grade? } →
                                           snapshot + mint in one transaction;
                                           with grade: mints straight to GRADED
                                           (grade + name frozen atomically)
PATCH  /certs/:certNumber/grade            { grade } → freeze grade+name, GRADED
POST   /certs/:certNumber/photos/presign   { contentType } → presigned PUT + objectKey
POST   /certs/:certNumber/photos           { objectKey, sortOrder } → register photo
DELETE /certs/:certNumber/photos/:photoId  remove photo (retakes)
```

### Auth

1. Mobile performs native Google sign-in, obtains a Google ID token.
2. `POST /auth/google` verifies the token with Google (signature + audience),
   looks up the email in `User` where `isActive` — this table **is** the
   allowlist; no row means no access.
3. API signs its own JWT (sub, email, role), 30-day expiry, stored in Expo
   SecureStore. No refresh tokens for now; re-sign-in on expiry is acceptable
   for 2–3 internal users and refresh can be added later without breaking
   anything.
4. Future identity providers (Apple, email) are additional exchange endpoints;
   everything downstream of our JWT is unchanged.

### Permissions (CASL)

- `defineAbilityFor(user)` lives in `packages/shared`.
- TEAM_MEMBER: `create Cert`, `grade Cert`, manage photos.
- ADMIN: additionally `manage User`, `manage GradeName`.
- Nest `PoliciesGuard` + `@CheckPolicies(...)` enforce per-route; mobile reuses
  the same ability builder to hide UI the user can't act on.

### Photos

Two-call direct upload: presign → client PUTs bytes straight to the bucket →
register object key. The API never proxies image bytes. Object keys are scoped
`certs/{certId}/{uuid}` so orphans from interrupted flows are identifiable and
harmless; no cleanup job needed at this scale.

## Mobile app

Expo Router, TanStack Query, expo-secure-store, native Google sign-in (works in
free local dev builds).

```
Sign In → Home (cert list) → New Cert (revised 2026-09-02 — late minting):
                              1. Card Search
                              2. Grade Entry    (pre-mint; nothing permanent yet)
                              3. Final Check    ── card + label confirm ──▶ MINT (GRADED)
                              4. Cert Created   (big number display)
                              5. Cert Detail    (photo upload)
```

- **Home** — recent certs with status chips and search; the re-entry point for
  attaching photos after the slab is sealed on the separate label device.
- **Card Search** — queries the card catalog via `/cards/search` (thumbnails).
- **Grade Entry** — numeric picker (whole numbers now, decimal-ready) showing
  the configured grade name live from `/grade-names`. Happens BEFORE minting.
- **Final Check** — the point of no return, showing BOTH the card (thumbnail +
  detail rows) and the label (rendered mock including the grade), with the
  **Prototype checkbox** and an irreversible-mint confirm dialog. Only after
  this does `POST /certs { …, grade }` mint — number + grade in one atomic
  transaction. Abandoning the flow before this point leaves nothing behind.
- **Cert Created** — freshly minted number, huge and copyable (entered into the
  label-printer device); continues to Cert Detail for photos.
- **Cert Detail** — full record + photo section: camera/library → presign →
  direct upload → register; per-photo upload state; delete/retake. Also hosts
  the legacy post-mint grade entry for any remaining `PENDING_GRADE` certs.

Each screen boundary is an API state transition, so killing the app mid-flow
loses nothing — any cert resumes from Home at whatever state it reached.

**Minting is irreversible in the app** — no delete-cert button. A mis-minted
cert stays in the ledger; visible gaps in sequential numbering are worse than an
occasional dud. Deletion, if ever needed, is a future admin action.

## Web app

Next.js App Router, Tailwind, neutral grays (wireframe aesthetic; design round
comes later).

```
/                    Landing: hero + large cert search box, few recent slabs
/cert/[certNumber]   Permanent cert page (QR target)
/catalog             Recently graded grid, searchable, paginated
```

- **Search box** is format-aware via the shared validator: cert-pattern input
  navigates to `/cert/…`, anything else becomes a `/catalog?q=…` card search.
- **`/cert/[certNumber]`** — server-rendered, works with zero JS. Shows label
  data, grade + name, Prototype badge, photos (or "photos coming soon"), grade
  date. Unknown numbers → friendly 404. Input validated against the shared
  regex before any API call.
- **`/catalog`** — newest-first grid from `GET /certs`, page-based pagination.
- **Caching:** ~60s revalidation on cert and catalog pages (cert core data is
  immutable once graded, but photos arrive later).
- **Metadata:** per-cert `<title>`/OpenGraph ("Charizard — MAC 10 Mac Daddy")
  so shared links unfurl.

## Error handling

- Global Nest exception filter → consistent `{ statusCode, message, code }`;
  DTO validation on all endpoints.
- Minting: counter transaction serializes concurrent mints; failure = no
  increment, no gap; mobile shows retry.
- Grading a `GRADED` cert → 409. Grading a value with no configured name is
  allowed (name freezes as null, displays as the number alone).
- Mobile: per-call retries/error states via TanStack Query; photo uploads fail
  and retry individually.
- Web: friendly 404 for unknown certs; "temporarily unavailable" state if the
  API is down.

## Testing

TDD throughout, weighted where the risk is:

- **`packages/shared`** — unit tests for cert-number format/parse/validate.
- **API** — unit tests for minting and grading services; real-Postgres
  concurrency test (parallel mints → unique, consecutive, gapless numbers);
  supertest e2e over the route surface against a test database.
- **Web/mobile** — thin for now (logic lives in API + shared); manual testing
  pre-brand; Playwright smoke tests arrive with the design round.

## Implementation phases

1. **Foundation** — monorepo scaffold, docker-compose (Postgres + MinIO),
   Prisma schema + migrations, `packages/shared` cert-number utilities.
2. **API core** — auth (Google exchange, JWT, CASL), cert minting, grading,
   grade names, card stub, photo presign/register.
3. **Mobile** — full team flow (sign-in → search → mint → grade → photos).
4. **Web** — landing, cert page, catalog.
