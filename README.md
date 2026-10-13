# Sycamore Transaction Intelligence Platform

A multi-tenant transaction intelligence platform for Nigerian businesses: import financial
transactions, auto-categorise them, flag suspicious activity, and review or correct automated
decisions. Primary currency is NGN, with backend-enforced tenant isolation.

> **Status: Phase 1 of 4: Foundation & Data Model.**
> Auth, tenant isolation, accounts, and monetary handling are in place and tested.
> Transactions, AI categorisation, review, dashboard, and the frontend land in phases 2-4.

## Stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript + **Fastify 5** (zod-validated boundaries) |
| Database | **PostgreSQL 16** + **Prisma 7** (driver adapter, query compiler) |
| Frontend | Vue 3 + Vite (Phase 4) |
| Tests | Vitest (unit + integration via `app.inject`) |

## Prerequisites

- Node.js >= 20.19
- PostgreSQL 16 (via Homebrew: `brew install postgresql@16 && brew services start postgresql@16`)
  or via the included [docker-compose.yml](docker-compose.yml).

## Setup

```bash
# 1. Create the databases (skip if using docker-compose, which creates `sycamore`)
createdb sycamore
createdb sycamore_test

# 2. Configure environment
cd backend
cp .env.example .env
#    Edit DATABASE_URL and replace USER with your macOS username (`whoami`).
#    Prisma 7 requires an explicit user in the URL.

# 3. Install dependencies
npm install

# 4. Apply migrations and seed
npm run db:deploy
npm run db:seed

# 5. Run
npm run dev          # http://localhost:3000
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the API with watch mode |
| `npm run typecheck` | TypeScript check |
| `npm test` | Run unit + integration tests (uses `sycamore_test`) |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:seed` | Seed dev data (2 orgs, 4 users, 5 accounts) |
| `npm run db:migrate` | Create a new migration (dev) |
| `npm run db:generate` | Regenerate the Prisma client |

## API (Phase 1)

Base URL `/api/v1`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | no | Liveness probe |
| POST | `/auth/login` | no | Exchange credentials for a JWT |
| GET | `/accounts` | yes | List the caller's organisation's accounts |
| POST | `/accounts` | yes | Create an account |
| GET | `/categories` | yes | List transaction categories |

Seed users (password `password123`): `admin@acme.ng`, `finance@acme.ng`,
`admin@globex.ng`, `finance@globex.ng`.

## What's demonstrated so far

- **Tenant isolation** - every query is scoped by the JWT's `organizationId`; an org cannot see
  another org's accounts (covered by an integration test).
- **Monetary correctness** - amounts are stored as integer minor units (kobo) in a `bigint`, never
  floats. See [backend/src/lib/money.ts](backend/src/lib/money.ts).

## Roadmap

- **Phase 2** - transaction import (single + batch, idempotency, dedupe, partial failure), browse.
- **Phase 3** - AI categorisation (provider abstraction + worker), review flags, manual correction.
- **Phase 4** - dashboard, Vue frontend, OpenAPI docs, full architecture write-up.
