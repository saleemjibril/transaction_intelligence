import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "../src/generated/prisma/client";
import { Direction, FlagStatus, FlagType, TransactionCategory, TransactionStatus } from "../src/generated/prisma/enums";
import type { Db } from "../src/db";
import { MockProvider } from "../src/modules/categorization/mock-provider";
import { RulesProvider } from "../src/modules/categorization/rules-provider";
import { claimPending, processOne } from "../src/modules/categorization/worker";
import { buildTestApp, login, resetTestDb, seedOrg } from "./helpers";

let db: Db;
let app: ReturnType<typeof buildTestApp>;
let acmeOrgId: string;
let acmeOps: { id: string };
let acmeToken: string;

const rules = new RulesProvider();
let seq = 0;

beforeAll(async () => {
  db = await resetTestDb();
  const acme = await seedOrg(db, { name: "Acme", slug: "acme", accounts: [{ name: "Acme Ops" }] });
  acmeOrgId = acme.orgId;
  acmeOps = acme.accounts[0]!;
  app = buildTestApp(db);
  acmeToken = await login(app, "admin@acme.ng");
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function createPending(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return db.transaction.create({
    data: {
      organizationId: acmeOrgId,
      accountId: acmeOps.id,
      externalRef: `PND-${seq}`,
      amountMinor: 100000n,
      direction: Direction.DEBIT,
      currency: "NGN",
      description: "test transaction",
      date: new Date("2026-09-10T10:00:00.000Z"),
      ...overrides,
    } as Prisma.TransactionUncheckedCreateInput,
  });
}

function authHeader() {
  return { authorization: `Bearer ${acmeToken}` };
}

describe("categorization worker", () => {
  it("claims and categorises pending transactions, recording the decision", async () => {
    const a = await createPending({ description: "Monthly staff payroll", merchant: "Access Bank" });
    const b = await createPending({ description: "Electricity bill", merchant: "Eko Electricity" });

    const claimed = await claimPending(db, 100);
    expect(claimed.map((t) => t.id)).toEqual(expect.arrayContaining([a.id, b.id]));

    for (const tx of claimed) {
      await processOne(db, rules, tx);
    }

    const updatedA = await db.transaction.findUnique({ where: { id: a.id } });
    expect(updatedA?.status).toBe(TransactionStatus.CATEGORIZED);
    expect(updatedA?.category).toBe(TransactionCategory.PAYROLL);
    expect(updatedA?.confidence).toBe(0.9);

    const logs = await db.classificationLog.findMany({ where: { transactionId: a.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.source).toBe("rules");
    expect(logs[0]?.category).toBe(TransactionCategory.PAYROLL);
  });

  it("flags a transaction above the large-amount threshold", async () => {
    const tx = await createPending({
      amountMinor: 800_000_000n,
      direction: Direction.CREDIT,
      description: "Large customer payment",
    });
    await processOne(db, rules, tx);

    const flags = await db.transactionFlag.findMany({ where: { transactionId: tx.id } });
    expect(flags.some((f) => f.type === FlagType.LARGE_AMOUNT)).toBe(true);

    const updated = await db.transaction.findUnique({ where: { id: tx.id } });
    expect(updated?.status).toBe(TransactionStatus.REVIEW_REQUIRED);
  });

  it("flags a low-confidence classification", async () => {
    const tx = await createPending({ description: "mystery expense" });
    await processOne(db, rules, tx);

    const updated = await db.transaction.findUnique({ where: { id: tx.id } });
    expect(updated?.category).toBe(TransactionCategory.OTHER);
    expect(updated?.confidence).toBe(0.3);

    const flags = await db.transactionFlag.findMany({ where: { transactionId: tx.id } });
    expect(flags.some((f) => f.type === FlagType.LOW_CONFIDENCE)).toBe(true);
  });

  it("flags a near duplicate of a recent transaction", async () => {
    const a = await createPending({ merchant: "DoubleCharge Inc", description: "Office rent" });
    await processOne(db, rules, a);
    expect(await db.transactionFlag.count({ where: { transactionId: a.id } })).toBe(0);

    const b = await createPending({ merchant: "DoubleCharge Inc", description: "Office rent" });
    await processOne(db, rules, b);

    const flags = await db.transactionFlag.findMany({ where: { transactionId: b.id } });
    expect(flags.some((f) => f.type === FlagType.NEAR_DUPLICATE)).toBe(true);
  });

  it("flags a category that contradicts a merchant's history", async () => {
    const prior = {
      organizationId: acmeOrgId,
      accountId: acmeOps.id,
      merchant: "VendorCo",
      direction: Direction.DEBIT,
      currency: "NGN",
      amountMinor: 50000n,
      date: new Date("2026-09-01T10:00:00.000Z"),
      category: TransactionCategory.RENT,
      status: TransactionStatus.CATEGORIZED,
    };
    await db.transaction.create({ data: { ...prior, externalRef: "V-1", description: "office rent" } });
    await db.transaction.create({ data: { ...prior, externalRef: "V-2", description: "office rent" } });

    const tx = await createPending({ merchant: "VendorCo", description: "software subscription" });
    await processOne(db, rules, tx);

    const flags = await db.transactionFlag.findMany({ where: { transactionId: tx.id } });
    expect(flags.some((f) => f.type === FlagType.UNEXPECTED_CATEGORY)).toBe(true);
  });

  it("flags unusual transaction frequency", async () => {
    const date = new Date("2026-08-01T10:00:00.000Z");
    const many = Array.from({ length: 21 }, (_, i) => ({
      organizationId: acmeOrgId,
      accountId: acmeOps.id,
      externalRef: `FREQ-${i}`,
      amountMinor: 1000n,
      direction: Direction.DEBIT,
      currency: "NGN",
      description: "rapid charge",
      date,
    }));
    await db.transaction.createMany({ data: many });

    const tx = await db.transaction.findFirst({ where: { externalRef: "FREQ-0" } });
    await processOne(db, rules, tx!);

    const flags = await db.transactionFlag.findMany({ where: { transactionId: tx!.id } });
    expect(flags.some((f) => f.type === FlagType.FREQUENCY)).toBe(true);
  });
});

describe("provider outage handling", () => {
  it("schedules the retry strictly in the future", async () => {
    // Guards against timezone skew: if the database session is not UTC, the
    // retry timestamp lands in the past and the backoff is silently ignored,
    // so the worker hammers an unavailable provider instead of waiting.
    const tx = await createPending({ description: "Monthly staff payroll" });
    const failing = new MockProvider("fail");

    await processOne(db, failing, tx, { baseBackoffMs: 60_000 });

    const updated = await db.transaction.findUnique({ where: { id: tx.id } });
    expect(updated?.categorizationAttempts).toBe(1);
    expect(updated!.nextCategorizationAt.getTime()).toBeGreaterThan(Date.now());
    expect(updated!.nextCategorizationAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000 + 5_000);
  });

  it("keeps ingestion independent of the provider and drains the backlog on recovery", async () => {
    const tx = await createPending({ description: "Monthly staff payroll", merchant: "OutageVendor" });
    const failing = new MockProvider("fail");

    await processOne(db, failing, tx);
    let updated = await db.transaction.findUnique({ where: { id: tx.id } });
    expect(updated?.status).toBe(TransactionStatus.PENDING_CATEGORIZATION);
    expect(updated?.categorizationAttempts).toBe(1);

    // provider recovers: the same row categorises successfully on a later attempt
    await processOne(db, rules, updated!);
    updated = await db.transaction.findUnique({ where: { id: tx.id } });
    expect(updated?.status).toBe(TransactionStatus.CATEGORIZED);
    expect(updated?.category).toBe(TransactionCategory.PAYROLL);
  });

  it("falls back to rules and flags for review after repeated failures", async () => {
    const tx = await createPending({ description: "Monthly staff payroll", merchant: "Access Bank" });
    const failing = new MockProvider("fail");

    let current = tx;
    for (let i = 0; i < 5; i++) {
      await processOne(db, failing, current);
      current = (await db.transaction.findUnique({ where: { id: tx.id } }))!;
    }

    expect(current.status).toBe(TransactionStatus.REVIEW_REQUIRED);
    expect(current.category).toBe(TransactionCategory.PAYROLL);
    expect(current.categorizationAttempts).toBe(5);

    const flags = await db.transactionFlag.findMany({ where: { transactionId: tx.id } });
    expect(flags.some((f) => f.type === FlagType.LOW_CONFIDENCE)).toBe(true);
  });
});

describe("manual correction and review", () => {
  it("preserves the original classification when a category is corrected", async () => {
    const tx = await createPending({ description: "Monthly staff payroll", merchant: "Access Bank" });
    await processOne(db, rules, tx);

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/transactions/${tx.id}/category`,
      headers: authHeader(),
      payload: { category: "RENT" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().category).toBe("RENT");

    const logs = await db.classificationLog.findMany({ where: { transactionId: tx.id }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(2);
    const manual = logs[1]!;
    expect(manual.source).toBe("manual");
    expect(manual.previousCategory).toBe(TransactionCategory.PAYROLL);
    expect(manual.category).toBe(TransactionCategory.RENT);
    expect(manual.actorId).toBeTruthy();
  });

  it("lists transactions needing review and resolves them", async () => {
    const tx = await createPending({
      amountMinor: 800_000_000n,
      direction: Direction.CREDIT,
      description: "Large customer payment",
    });
    await processOne(db, rules, tx);

    const listRes = await app.inject({ method: "GET", url: "/api/v1/review", headers: authHeader() });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.some((t: { id: string }) => t.id === tx.id)).toBe(true);

    const resolveRes = await app.inject({
      method: "POST",
      url: `/api/v1/transactions/${tx.id}/review`,
      headers: authHeader(),
      payload: { action: "resolve" },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().status).toBe("REVIEWED");

    const flags = await db.transactionFlag.findMany({ where: { transactionId: tx.id } });
    expect(flags.every((f) => f.status === FlagStatus.RESOLVED)).toBe(true);

    const after = await app.inject({ method: "GET", url: "/api/v1/review", headers: authHeader() });
    expect(after.json().data.some((t: { id: string }) => t.id === tx.id)).toBe(false);
  });
});
