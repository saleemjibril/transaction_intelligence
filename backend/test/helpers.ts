import { execSync } from "node:child_process";
import { buildApp } from "../src/app";
import { createPrismaClient, type Db } from "../src/db";
import { AccountType, Role } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/password";

export const TEST_URL = `postgresql://${process.env.USER}@127.0.0.1:5432/sycamore_test`;

export async function resetTestDb(): Promise<Db> {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "ignore",
  });
  const db = createPrismaClient(TEST_URL);
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Organization", "User", "Account", "Transaction", "TransactionFlag", "ClassificationLog", "IdempotencyKey" RESTART IDENTITY CASCADE',
  );
  return db;
}

export function buildTestApp(db: Db) {
  return buildApp({ db, jwtSecret: "test-secret", logger: false });
}

export async function login(app: ReturnType<typeof buildApp>, email: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password: "password123" },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed for ${email}: ${res.statusCode}`);
  }
  return res.json<{ token: string }>().token;
}

export async function seedOrg(
  db: Db,
  opts: { name: string; slug: string; accounts: { name: string; type?: AccountType }[] },
) {
  const org = await db.organization.create({ data: { name: opts.name, slug: opts.slug } });
  const passwordHash = hashPassword("password123");
  await db.user.create({
    data: { email: `admin@${opts.slug}.ng`, passwordHash, role: Role.ADMIN, organizationId: org.id },
  });

  const accounts: { id: string; name: string }[] = [];
  for (const a of opts.accounts) {
    const created = await db.account.create({
      data: { organizationId: org.id, name: a.name, type: a.type ?? AccountType.CHECKING },
    });
    accounts.push({ id: created.id, name: a.name });
  }

  return { orgId: org.id, accounts };
}
