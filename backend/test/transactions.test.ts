import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db";
import { Direction, TransactionCategory, TransactionStatus } from "../src/generated/prisma/enums";
import { decimalStringToMinorUnits } from "../src/lib/money";
import { buildTestApp, login, resetTestDb, seedOrg } from "./helpers";

let db: Db;
let app: ReturnType<typeof buildTestApp>;
let acmeOrgId: string;
let acmeOps: { id: string };
let globexCurrent: { id: string };
let acmeToken: string;
let globexToken: string;

beforeAll(async () => {
  db = await resetTestDb();
  const acme = await seedOrg(db, {
    name: "Acme",
    slug: "acme",
    accounts: [{ name: "Acme Ops" }, { name: "Acme Payroll" }],
  });
  const globex = await seedOrg(db, {
    name: "Globex",
    slug: "globex",
    accounts: [{ name: "Globex Current" }],
  });
  acmeOps = acme.accounts.find((a) => a.name === "Acme Ops")!;
  globexCurrent = globex.accounts.find((a) => a.name === "Globex Current")!;
  acmeOrgId = acme.orgId;

  app = buildTestApp(db);
  acmeToken = await login(app, "admin@acme.ng");
  globexToken = await login(app, "admin@globex.ng");
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

function payload(overrides: Record<string, unknown> = {}) {
  return {
    externalRef: "REF-001",
    accountId: acmeOps.id,
    amount: "12999.75",
    direction: "CREDIT",
    description: "Customer payment",
    date: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("single import", () => {
  it("stores amounts as integer minor units", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      headers: authHeader(acmeToken),
      payload: payload(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.amount).toBe("12999.75");

    const stored = await db.transaction.findUnique({ where: { id: body.id } });
    expect(stored?.amountMinor).toBe(decimalStringToMinorUnits("12999.75", "NGN"));
  });

  it("rejects a duplicate externalRef + account", async () => {
    const p = payload({ externalRef: "REF-DUP" });
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      headers: authHeader(acmeToken),
      payload: p,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      headers: authHeader(acmeToken),
      payload: p,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("DUPLICATE_TRANSACTION");
  });

  it("replays a request carrying the same idempotency key", async () => {
    const p = payload({ externalRef: "REF-IDEM" });
    const headers = { ...authHeader(acmeToken), "idempotency-key": "key-1" };
    const a = await app.inject({ method: "POST", url: "/api/v1/transactions", headers, payload: p });
    const b = await app.inject({ method: "POST", url: "/api/v1/transactions", headers, payload: p });

    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(b.json().id).toBe(a.json().id);
    expect(await db.transaction.count({ where: { externalRef: "REF-IDEM" } })).toBe(1);
  });

  it("allows exactly one concurrent duplicate import", async () => {
    const p = payload({ externalRef: "REF-CONC" });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject({ method: "POST", url: "/api/v1/transactions", headers: authHeader(acmeToken), payload: p }),
      ),
    );

    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(9);
    expect(await db.transaction.count({ where: { externalRef: "REF-CONC" } })).toBe(1);
  });

  it("rejects an account belonging to another organisation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      headers: authHeader(acmeToken),
      payload: payload({ accountId: globexCurrent.id }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("ACCOUNT_NOT_FOUND");
  });
});

describe("batch import", () => {
  it("imports valid rows and reports invalid ones without rolling back", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/batch",
      headers: authHeader(acmeToken),
      payload: {
        transactions: [
          payload({ externalRef: "BATCH-1" }),
          payload({ externalRef: "BATCH-2" }),
          {
            externalRef: "BATCH-BAD",
            accountId: acmeOps.id,
            amount: "not-a-number",
            direction: "CREDIT",
            description: "bad row",
            date: "2026-10-01T10:00:00.000Z",
          },
          payload({ externalRef: "BATCH-3" }),
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.imported).toHaveLength(3);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]?.index).toBe(2);
    expect(
      await db.transaction.count({ where: { externalRef: { in: ["BATCH-1", "BATCH-2", "BATCH-3"] } } }),
    ).toBe(3);
  });
});

describe("browse", () => {
  it("paginates with a cursor without repeating rows", async () => {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = cursor
        ? `/api/v1/transactions?limit=2&cursor=${cursor}`
        : "/api/v1/transactions?limit=2";
      const res = await app.inject({ method: "GET", url, headers: authHeader(acmeToken) });
      const body: { data: { id: string }[]; nextCursor: string | null } = res.json();
      ids.push(...body.data.map((t) => t.id));
      cursor = body.nextCursor;
    } while (cursor);

    expect(ids.length).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filters by search term", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/transactions?search=Customer",
      headers: authHeader(acmeToken),
    });
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
    for (const t of body.data) {
      expect(`${t.description} ${t.merchant ?? ""}`.toLowerCase()).toContain("customer");
    }
  });
});

describe("browse filters", () => {
  beforeAll(async () => {
    // Created directly via the client because the import API always writes
    // PENDING_CATEGORIZATION with a null category (Phase 3 adds the rest).
    const base = {
      organizationId: acmeOrgId,
      accountId: acmeOps.id,
      currency: "NGN",
      description: "FilterFixture",
      amountMinor: decimalStringToMinorUnits("1000.00", "NGN"),
    };

    await db.transaction.createMany({
      data: [
        { ...base, externalRef: "FLT-CR-1", direction: Direction.CREDIT, category: TransactionCategory.REVENUE, status: TransactionStatus.CATEGORIZED, date: new Date("2026-09-10T10:00:00.000Z") },
        { ...base, externalRef: "FLT-CR-2", direction: Direction.CREDIT, category: TransactionCategory.REVENUE, status: TransactionStatus.CATEGORIZED, date: new Date("2026-09-12T10:00:00.000Z") },
        { ...base, externalRef: "FLT-DR-1", direction: Direction.DEBIT, category: TransactionCategory.PAYROLL, status: TransactionStatus.CATEGORIZED, date: new Date("2026-09-10T10:00:00.000Z") },
        { ...base, externalRef: "FLT-DR-2", direction: Direction.DEBIT, category: TransactionCategory.REVENUE, status: TransactionStatus.PENDING_CATEGORIZATION, date: new Date("2026-09-01T10:00:00.000Z") },
      ],
    });
  });

  async function filterResults(query: string) {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/transactions?search=FilterFixture&${query}`,
      headers: authHeader(acmeToken),
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it("filters by direction", async () => {
    const body = await filterResults("direction=CREDIT");
    expect(body.data).toHaveLength(2);
    for (const t of body.data) expect(t.direction).toBe("CREDIT");
  });

  it("filters by category", async () => {
    const body = await filterResults("category=PAYROLL");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.category).toBe("PAYROLL");
  });

  it("filters by status", async () => {
    const body = await filterResults("status=PENDING_CATEGORIZATION");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.status).toBe("PENDING_CATEGORIZATION");
  });

  it("filters by date range", async () => {
    const body = await filterResults("from=2026-09-05&to=2026-09-15");
    expect(body.data).toHaveLength(3);
  });
});

describe("tenant isolation", () => {
  it("does not expose another organisation's transaction by id", async () => {
    const importRes = await app.inject({
      method: "POST",
      url: "/api/v1/transactions",
      headers: authHeader(globexToken),
      payload: {
        externalRef: "GLX-SECRET",
        accountId: globexCurrent.id,
        amount: "5000.00",
        direction: "DEBIT",
        description: "Diesel",
        date: "2026-10-01T10:00:00.000Z",
      },
    });
    const globexTxId = importRes.json().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/transactions/${globexTxId}`,
      headers: authHeader(acmeToken),
    });
    expect(res.statusCode).toBe(404);
  });
});
