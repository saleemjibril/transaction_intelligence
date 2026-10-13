import { config } from "../src/config";
import { createPrismaClient } from "../src/db";
import { AccountType, Role } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/password";

const db = createPrismaClient(config.DATABASE_URL);

// Demo password for all seeded users - clearly a dev-only convenience.
const DEMO_PASSWORD = "password123";

async function main() {
  const passwordHash = hashPassword(DEMO_PASSWORD);

  const acme = await db.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: { name: "Acme Traders Ltd", slug: "acme" },
  });
  const globex = await db.organization.upsert({
    where: { slug: "globex" },
    update: {},
    create: { name: "Globex Logistics", slug: "globex" },
  });

  const users = [
    { email: "admin@acme.ng", role: Role.ADMIN, organizationId: acme.id },
    { email: "finance@acme.ng", role: Role.MEMBER, organizationId: acme.id },
    { email: "admin@globex.ng", role: Role.ADMIN, organizationId: globex.id },
    { email: "finance@globex.ng", role: Role.MEMBER, organizationId: globex.id },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, passwordHash, role: u.role, organizationId: u.organizationId },
    });
  }

  const accounts = [
    { organizationId: acme.id, name: "GTBank - Operations", type: AccountType.CHECKING },
    { organizationId: acme.id, name: "GTBank - Savings", type: AccountType.SAVINGS },
    { organizationId: acme.id, name: "Access Bank - Payroll", type: AccountType.CHECKING },
    { organizationId: globex.id, name: "Zenith - Current", type: AccountType.CHECKING },
    { organizationId: globex.id, name: "Zenith - Reserve", type: AccountType.SAVINGS },
  ];
  for (const a of accounts) {
    await db.account.upsert({
      where: { organizationId_name: { organizationId: a.organizationId, name: a.name } },
      update: {},
      create: a,
    });
  }

  console.log("Seed complete: 2 organisations, 4 users, 5 accounts");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
