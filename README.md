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

API e2e tests (need the docker stack running; they use a separate `_test` database):

    pnpm test:e2e

Spec: `docs/superpowers/specs/2026-08-31-mac-grading-design.md`
