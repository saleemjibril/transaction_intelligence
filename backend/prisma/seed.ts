import { config } from "../src/config";
import { createPrismaClient } from "../src/db";
import {
  AccountType,
  Direction,
  Role,
  TransactionCategory,
  TransactionStatus,
} from "../src/generated/prisma/enums";
import { decimalStringToMinorUnits } from "../src/lib/money";
import { hashPassword } from "../src/lib/password";

const db = createPrismaClient(config.DATABASE_URL);

// Demo password for all seeded users - clearly a dev-only convenience.
const DEMO_PASSWORD = "password123";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
}

interface SeedTxn {
  orgId: string;
  account: string;
  ref: string;
  amount: string;
  direction: Direction;
  description: string;
  merchant?: string;
  daysAgo: number;
  category: TransactionCategory;
}

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

  const accountDefs = [
    { organizationId: acme.id, name: "GTBank - Operations", type: AccountType.CHECKING },
    { organizationId: acme.id, name: "GTBank - Savings", type: AccountType.SAVINGS },
    { organizationId: acme.id, name: "Access Bank - Payroll", type: AccountType.CHECKING },
    { organizationId: globex.id, name: "Zenith - Current", type: AccountType.CHECKING },
    { organizationId: globex.id, name: "Zenith - Reserve", type: AccountType.SAVINGS },
  ];
  const accountIds = new Map<string, string>();
  for (const a of accountDefs) {
    const account = await db.account.upsert({
      where: { organizationId_name: { organizationId: a.organizationId, name: a.name } },
      update: {},
      create: a,
    });
    accountIds.set(`${a.organizationId}|${a.name}`, account.id);
  }

  const txns: SeedTxn[] = [
    // Acme Traders Ltd
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-INV-1042", amount: "2850000.00", direction: Direction.CREDIT, description: "Customer payment - invoice 1042", merchant: "Zaria Wholesalers", daysAgo: 5, category: TransactionCategory.REVENUE },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-INV-1041", amount: "1150000.00", direction: Direction.CREDIT, description: "Customer payment - invoice 1041", merchant: "Kano Textiles", daysAgo: 12, category: TransactionCategory.REVENUE },
    { orgId: acme.id, account: "Access Bank - Payroll", ref: "ACME-PAY-009", amount: "1850000.00", direction: Direction.DEBIT, description: "Monthly staff payroll", merchant: "Access Bank", daysAgo: 28, category: TransactionCategory.PAYROLL },
    { orgId: acme.id, account: "Access Bank - Payroll", ref: "ACME-PAY-008", amount: "1850000.00", direction: Direction.DEBIT, description: "Monthly staff payroll", merchant: "Access Bank", daysAgo: 58, category: TransactionCategory.PAYROLL },
    { orgId: acme.id, account: "Access Bank - Payroll", ref: "ACME-PAY-007", amount: "1850000.00", direction: Direction.DEBIT, description: "Monthly staff payroll", merchant: "Access Bank", daysAgo: 88, category: TransactionCategory.PAYROLL },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-RENT-004", amount: "900000.00", direction: Direction.DEBIT, description: "Office rent - Lagos office", merchant: "Prime Properties", daysAgo: 20, category: TransactionCategory.RENT },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-RENT-003", amount: "900000.00", direction: Direction.DEBIT, description: "Office rent - Lagos office", merchant: "Prime Properties", daysAgo: 50, category: TransactionCategory.RENT },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-SW-014", amount: "35000.00", direction: Direction.DEBIT, description: "Slack subscription", merchant: "Slack", daysAgo: 15, category: TransactionCategory.SOFTWARE },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-SW-013", amount: "120000.00", direction: Direction.DEBIT, description: "AWS infrastructure", merchant: "AWS", daysAgo: 22, category: TransactionCategory.SOFTWARE },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-MKT-021", amount: "400000.00", direction: Direction.DEBIT, description: "Facebook ads campaign", merchant: "Meta", daysAgo: 10, category: TransactionCategory.MARKETING },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-TRV-003", amount: "145000.00", direction: Direction.DEBIT, description: "Flight to Abuja", merchant: "Air Peace", daysAgo: 8, category: TransactionCategory.TRAVEL },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-UTL-008", amount: "85000.00", direction: Direction.DEBIT, description: "Electricity bill", merchant: "Eko Electricity", daysAgo: 6, category: TransactionCategory.UTILITIES },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-TAX-002", amount: "750000.00", direction: Direction.DEBIT, description: "FIRS quarterly VAT", merchant: "FIRS", daysAgo: 45, category: TransactionCategory.TAX },
    { orgId: acme.id, account: "GTBank - Operations", ref: "ACME-BNK-011", amount: "2500.00", direction: Direction.DEBIT, description: "Monthly account maintenance", merchant: "GTBank", daysAgo: 3, category: TransactionCategory.BANKING_FEES },

    // Globex Logistics
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-CON-003", amount: "3200000.00", direction: Direction.CREDIT, description: "Logistics contract - Q3", merchant: "Agmada Agro", daysAgo: 7, category: TransactionCategory.REVENUE },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-CON-002", amount: "680000.00", direction: Direction.CREDIT, description: "Delivery services", merchant: "FreshMart", daysAgo: 9, category: TransactionCategory.REVENUE },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-PAY-006", amount: "1200000.00", direction: Direction.DEBIT, description: "Driver salaries", merchant: "Zenith Bank", daysAgo: 28, category: TransactionCategory.PAYROLL },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-RNT-002", amount: "650000.00", direction: Direction.DEBIT, description: "Warehouse rent", merchant: "Ikeja Estates", daysAgo: 18, category: TransactionCategory.RENT },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-SW-005", amount: "95000.00", direction: Direction.DEBIT, description: "Fleet management software", merchant: "Fleetio", daysAgo: 14, category: TransactionCategory.SOFTWARE },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-FL-018", amount: "320000.00", direction: Direction.DEBIT, description: "Fuel for fleet", merchant: "TotalEnergies", daysAgo: 5, category: TransactionCategory.TRAVEL },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-FL-017", amount: "310000.00", direction: Direction.DEBIT, description: "Fuel for fleet", merchant: "TotalEnergies", daysAgo: 11, category: TransactionCategory.TRAVEL },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-UTL-004", amount: "70000.00", direction: Direction.DEBIT, description: "Warehouse electricity", merchant: "Ikeja Electric", daysAgo: 6, category: TransactionCategory.UTILITIES },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-TRF-009", amount: "1500000.00", direction: Direction.DEBIT, description: "Transfer to reserve account", merchant: "Zenith Bank", daysAgo: 4, category: TransactionCategory.TRANSFERS },
    { orgId: globex.id, account: "Zenith - Current", ref: "GLX-BNK-007", amount: "1800.00", direction: Direction.DEBIT, description: "Bank charges", merchant: "Zenith Bank", daysAgo: 2, category: TransactionCategory.BANKING_FEES },
  ];

  const data = txns.map((t) => {
    const accountId = accountIds.get(`${t.orgId}|${t.account}`);
    if (!accountId) {
      throw new Error(`Unknown account: ${t.account}`);
    }
    const date = daysAgo(t.daysAgo);
    return {
      organizationId: t.orgId,
      accountId,
      externalRef: t.ref,
      amountMinor: decimalStringToMinorUnits(t.amount, "NGN"),
      direction: t.direction,
      currency: "NGN",
      description: t.description,
      merchant: t.merchant,
      date,
      category: t.category,
      status: TransactionStatus.CATEGORIZED,
      confidence: 0.96,
      categorizedAt: date,
    };
  });

  await db.transaction.createMany({ data, skipDuplicates: true });

  console.log(`Seed complete: 2 organisations, 4 users, 5 accounts, ${data.length} transactions`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
