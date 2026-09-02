# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
# openssl: required by Prisma's query engine on slim images
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
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
CMD ["node", "dist/src/main"]
