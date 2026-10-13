import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createPrismaClient, type Db } from "../src/db";
import { AccountType, Role } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/password";

const TEST_URL = `postgresql://${process.env.USER}@127.0.0.1:5432/sycamore_test`;

let db: Db;
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });

  db = createPrismaClient(TEST_URL);

  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "User", "Account", "Transaction", "TransactionFlag", "ClassificationLog", "IdempotencyKey" RESTART IDENTITY CASCADE',
  );

  const acme = await db.organization.create({ data: { name: "Acme", slug: "acme" } });
  const globex = await db.organization.create({ data: { name: "Globex", slug: "globex" } });

  const passwordHash = hashPassword("password123");
  await db.user.create({
    data: { email: "admin@acme.ng", passwordHash, role: Role.ADMIN, organizationId: acme.id },
  });
  await db.user.create({
    data: { email: "admin@globex.ng", passwordHash, role: Role.ADMIN, organizationId: globex.id },
  });

  await db.account.create({
    data: { organizationId: acme.id, name: "Acme Ops", type: AccountType.CHECKING },
  });
  await db.account.create({
    data: { organizationId: globex.id, name: "Globex Current", type: AccountType.CHECKING },
  });

  app = buildApp({ db, jwtSecret: "test-secret", logger: false });
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function login(email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password: "password123" },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ token: string }>().token;
}

describe("tenant isolation", () => {
  it("returns only the caller's own accounts", async () => {
    const token = await login("admin@acme.ng");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/accounts",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const accounts = res.json<{ name: string }[]>();
    expect(accounts.map((a) => a.name)).toEqual(["Acme Ops"]);
  });

  it("rejects requests without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/accounts" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@acme.ng", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });
});
