import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Direction, TransactionCategory, TransactionStatus } from "../src/generated/prisma/enums";
import type { Db } from "../src/db";
import { decimalStringToMinorUnits } from "../src/lib/money";
import { buildTestApp, login, resetTestDb, seedOrg } from "./helpers";

let db: Db;
let app: ReturnType<typeof buildTestApp>;
let orgId: string;
let accountId: string;
let token: string;

beforeAll(async () => {
  db = await resetTestDb();
  const org = await seedOrg(db, { name: "Acme", slug: "acme", accounts: [{ name: "Ops" }] });
  orgId = org.orgId;
  accountId = org.accounts[0]!.id;
  app = buildTestApp(db);
  token = await login(app, "admin@acme.ng");

  const base = {
    organizationId: orgId,
    accountId,
    currency: "NGN",
    date: new Date("2026-10-01T10:00:00.000Z"),
  };
  await db.transaction.createMany({
    data: [
      { ...base, externalRef: "D-1", amountMinor: decimalStringToMinorUnits("100.00", "NGN"), direction: Direction.CREDIT, description: "revenue", category: TransactionCategory.REVENUE, status: TransactionStatus.CATEGORIZED },
      { ...base, externalRef: "D-2", amountMinor: decimalStringToMinorUnits("30.00", "NGN"), direction: Direction.DEBIT, description: "rent", category: TransactionCategory.RENT, status: TransactionStatus.CATEGORIZED },
      { ...base, externalRef: "D-3", amountMinor: decimalStringToMinorUnits("20.00", "NGN"), direction: Direction.DEBIT, description: "software", category: TransactionCategory.SOFTWARE, status: TransactionStatus.CATEGORIZED },
      { ...base, externalRef: "D-4", amountMinor: decimalStringToMinorUnits("50.00", "NGN"), direction: Direction.CREDIT, description: "big", category: TransactionCategory.REVENUE, status: TransactionStatus.REVIEW_REQUIRED },
    ],
  });
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("dashboard summary", () => {
  it("computes inflows, outflows, net cash flow, spending and flagged count", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.totalInflows).toBe("150.00");
    expect(body.totalOutflows).toBe("50.00");
    expect(body.netCashFlow).toBe("100.00");
    expect(body.flaggedCount).toBe(1);

    const spending = body.spendingByCategory as Array<{ category: string; total: string }>;
    expect(spending.find((s) => s.category === "RENT")?.total).toBe("30.00");
    expect(spending.find((s) => s.category === "SOFTWARE")?.total).toBe("20.00");
    expect(spending.some((s) => s.category === "REVENUE")).toBe(false);
  });
});
