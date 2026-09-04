# @macgrading/api

Nest.js API for MAC Grading — public cert lookup + team operations.

## Scripts

    pnpm dev          # start with watch
    pnpm build        # compile
    pnpm test         # unit tests (none yet)
    pnpm test:e2e     # e2e tests (requires docker compose stack + migrated DB)
    pnpm db:migrate   # prisma migrate dev
    pnpm db:seed      # idempotent seed (cert counters + grade names)

Reads `DATABASE_URL` from `apps/api/.env` (copy from repo root `.env.example`).

# Railway pre-deploy runs deploy:release (migrate + idempotent seed); see docs/deploy/railway-runbook.md
