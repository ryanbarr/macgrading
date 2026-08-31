# MAC Grading

Mostly Accurate Certifications — meme card grading.

- `apps/api` — Nest.js API (public cert lookup + team operations)
- `apps/web` — Next.js public site (added in Phase 4)
- `apps/mobile` — Expo team app (added in Phase 3)
- `packages/shared` — cert-number utilities, shared types

## Setup

    pnpm install
    docker compose up -d --wait
    cp .env.example apps/api/.env
    pnpm --filter @macgrading/api db:migrate
    pnpm --filter @macgrading/api db:seed
    pnpm build && pnpm test

Mobile app (iOS simulator; needs Xcode):

    pnpm --filter @macgrading/mobile ios

Dev sign-in: set AUTH_DEV_MODE=true in apps/api/.env and EXPO_PUBLIC_DEV_AUTH=true
when starting expo, then sign in with a seeded team email.

API e2e tests (need the docker stack running; they use a separate `_test` database):

    pnpm test:e2e

Spec: `docs/superpowers/specs/2026-08-31-mac-grading-design.md`
