# Sycamore Transaction Intelligence Platform

A multi-tenant transaction intelligence platform for Nigerian businesses. It imports
financial transactions, categorises them automatically, flags activity that needs human
attention, and lets users correct the automated decisions. Primary currency is NGN, with
backend-enforced tenant isolation.

## Architecture

A single-repo monolith: Fastify 5 + Prisma 7 + PostgreSQL on the backend, and a Vue 3 +
Vite SPA on the frontend. `backend/` runs the API and the categorisation worker; `frontend/`
is the UI.

```
Transaction import  ->  PENDING_CATEGORIZATION  ->  background worker
                                                    (FOR UPDATE SKIP LOCKED)
                                                    ->  ClassificationProvider
                                                        (rules | mock | deepseek)
                                                    ->  review detectors
                                                    ->  CATEGORIZED | REVIEW_REQUIRED
                                                              |
                                                       manual correction
                                                       (ClassificationLog)
```

The key design decision is that **ingestion and AI categorisation are decoupled**. Importing
a transaction writes it as `PENDING_CATEGORIZATION` and returns immediately. A background
worker claims pending rows with `FOR UPDATE SKIP LOCKED` (safe for multiple workers), calls
the classification provider, runs the review detectors, and writes the result. If the
provider is slow, unavailable, rate-limited, or returns invalid data, the worker retries
with exponential backoff and eventually falls back to the deterministic rules provider.

### Classification providers

One `ClassificationProvider` interface, three implementations, selected by
`CLASSIFICATION_PROVIDER`:

| Provider | Behaviour |
|---|---|
| `rules` (default) | Deterministic keyword/amount heuristics. Free, instant, never fails. |
| `mock` | Fault injection (`ok`/`fail`/`rate-limit`/`invalid`) for exercising the failure paths. |
| `deepseek` | Real LLM call to DeepSeek's OpenAI-compatible API, JSON mode, output zod-validated at the boundary. |

### Review detectors

Five detectors run after classification, each emitting a human-readable explanation:
large amount, low confidence, near duplicate, unexpected category, and unusual frequency.
Any flag moves the transaction to `REVIEW_REQUIRED`.

### Money

All amounts are stored as integer minor units (kobo) in a `bigint` column. `₦12,999.75`
is stored as `1299975` and converted to a decimal string only at the API boundary, so no
floating-point arithmetic ever touches money. See `backend/src/lib/money.ts`.

### Multi-tenancy

Every table (`Account`, `Transaction`, `User`) carries an `organizationId` foreign key.
A JWT carries the tenant; a middleware resolves it, and every query is scoped by it. An
organisation cannot read another organisation's rows even with a valid id. Row-level
security in PostgreSQL is the documented production hardening on top of this.

## Setup

Prerequisites: Node.js 20.19+, PostgreSQL 16 (Homebrew or the included
`docker-compose.yml`).

### Backend

```bash
createdb sycamore
createdb sycamore_test

cd backend
cp .env.example .env        # set DATABASE_URL, replacing USER with `whoami`
npm install
npm run db:deploy           # apply migrations
npm run db:seed             # 2 orgs, 5 accounts, 27 transactions
npm run dev                 # http://localhost:3000
```

The seed includes three uncategorised transactions; on startup the worker categorises
them, flagging a ₦8,000,000 payment as `LARGE_AMOUNT` and an unmatched expense as
`LOW_CONFIDENCE`.

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to the backend)
```

Seed users (password `password123`): `admin@acme.ng`, `finance@acme.ng`,
`admin@globex.ng`, `finance@globex.ng`.

### API documentation

Swagger UI is served at `http://localhost:3000/docs`.

## Testing

Vitest, with unit tests and integration tests that run against a dedicated `sycamore_test`
database (test files run serially because they share one database). Coverage:

- **Money** - decimal-string and integer-kobo round-trips, and rejection of malformed or
  over-precise amounts.
- **Auth and tenant isolation** - login and invalid credentials, and that one organisation
  cannot read another organisation's accounts or transactions.
- **Transactions** - import, idempotent replay, concurrent duplicate handling, partial
  batch failure, and search/filter/cursor pagination.
- **Categorisation** - rules provider accuracy, all five review detectors, provider outage
  and recovery, dead-letter fallback after repeated failures, and retry scheduling.
- **Manual correction and review** - the audit log preserves the previous category, actor
  and time, and the review queue lists and resolves flags.
- **Dashboard** - exact inflows, outflows, net cash flow, and spending aggregation.

Run with `npm test` in `backend/`. The end-to-end `./scripts/smoke.sh` and `./scripts/demo.sh`
exercise the running API.

## Design scenarios

### 1. AI reliability (provider unavailable for six hours)

Ingestion is unaffected: transactions are written as `PENDING_CATEGORIZATION` and the API
returns immediately. The worker retries each pending row with exponential backoff (30s to
1h), so the provider is not hammered while down. Transactions simply queue as pending and
nothing is lost. When the provider recovers, the backlog drains automatically. After five
failed attempts a transaction falls back to the deterministic rules provider and is flagged
`LOW_CONFIDENCE` for human review, so a long outage never leaves data permanently
uncategorised. This path is exercised in tests via the mock provider.

### 2. AI cost

The rules provider handles the bulk of the traffic for free: recurring, keyword-detectable
transactions (payroll, rent, software subscriptions, bank fees) never reach an LLM. The
LLM is reserved for the ambiguous long tail. To scale that further without hurting accuracy:

- cache classifications keyed by normalised (merchant, description), so repeat patterns
  are classified once;
- only send low-confidence rules results to the LLM;
- batch LLM requests;
- periodically audit the correction rate per category and promote successful manual
  corrections into rules.

### 3. Scalability

Current design already anticipates volume: keyset cursor pagination instead of OFFSET,
indexes on `(organizationId, date)`, `(organizationId, category)`, and
`(organizationId, status, nextCategorizationAt)`, and a worker that already supports
multiple concurrent consumers via `FOR UPDATE SKIP LOCKED`. Going to 10M/day would add:

- a dedicated queue (BullMQ + Redis, or pg-boss) instead of the in-process poll loop;
- more worker replicas;
- bulk inserts (`createMany`) and batching for import;
- time-based or organisation-based table partitioning;
- read replicas for the dashboard and reporting, isolating them from the write path.

### 4. Product trust

Start by measuring: sample the complaints, and compare the assigned category against the
rules prediction and any manual corrections. Look for categories with a high correction
rate or a low confidence distribution. Then fix the root cause: add rules for the
misclassified patterns, tune the LLM prompt, or raise the review threshold for the
unreliable categories. The audit trail (`ClassificationLog`) records every automated and
manual decision with who changed what and when, and the review view surfaces the
confidence and the reason for every flag, so the finance team can see why a category was
chosen and correct it in one click. Trust is restored by transparency plus a feedback loop
from corrections back into the rules.

## Technical decisions and trade-offs

- **Integer minor units for money.** No floats, no decimal library, unambiguous precision.
  The trade-off is that callers must convert at the boundary, which the DTO layer does.
- **DB-backed worker instead of a message queue.** `FOR UPDATE SKIP LOCKED` gives safe
  concurrent claiming with no new infrastructure. A real queue is the production upgrade.
- **Idempotency via a unique-constrained key table** plus a tenant-scoped unique constraint
  on `(organizationId, externalRef, accountId)` for duplicate prevention.
- **Keyset pagination** over OFFSET for stable performance on large tables.
- **Timestamps are `timestamptz` with the connection pinned to UTC**, so a non-UTC
  database session cannot shift writes and silently defeat the retry backoff.
- **zod at the boundaries only.** Fastify validates HTTP input; zod validates environment
  config and untrusted LLM output. Internal typed code trusts the type system.
- **Scrypt password hashing** with no native dependency; argon2id is the production choice.
- **JWT auth** with a single role field rather than a full RBAC system (documented scope cut).

## Assumptions

- NGN is the only currency; the `currency` field is stored but no FX conversion is done.
- Categories are a fixed enum; a `Category` table would allow per-tenant custom categories.
- Batch import caps at 1000 rows per request; larger imports must be split.

## Potential improvements

- PostgreSQL row-level security for defence in depth.
- A real message queue and horizontal worker scaling.
- Caching and batching for the LLM provider (see scenario 2).
- Refresh tokens, password reset, and role-based access control.
- A `Category` table with per-tenant overrides.
