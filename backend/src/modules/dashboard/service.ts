import type { TransactionCategory } from "../../generated/prisma/enums";
import { TransactionStatus } from "../../generated/prisma/enums";
import type { Db } from "../../db";
import { minorUnitsToDecimalString } from "../../lib/money";

interface TotalsRow {
  inflowsMinor: bigint;
  outflowsMinor: bigint;
}

interface CategoryRow {
  category: TransactionCategory;
  totalMinor: bigint;
}

export async function getSummary(db: Db, organizationId: string) {
  const [totals] = await db.$queryRaw<TotalsRow[]>`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN "amountMinor" ELSE 0 END), 0)::bigint AS "inflowsMinor",
      COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN "amountMinor" ELSE 0 END), 0)::bigint AS "outflowsMinor"
    FROM "Transaction"
    WHERE "organizationId" = ${organizationId}
  `;

  const byCategory = await db.$queryRaw<CategoryRow[]>`
    SELECT category, SUM("amountMinor")::bigint AS "totalMinor"
    FROM "Transaction"
    WHERE "organizationId" = ${organizationId} AND direction = 'DEBIT' AND category IS NOT NULL
    GROUP BY category
    ORDER BY "totalMinor" DESC
  `;

  const flaggedCount = await db.transaction.count({
    where: { organizationId, status: TransactionStatus.REVIEW_REQUIRED },
  });

  const inflowsMinor = totals?.inflowsMinor ?? 0n;
  const outflowsMinor = totals?.outflowsMinor ?? 0n;

  return {
    totalInflows: minorUnitsToDecimalString(inflowsMinor, "NGN"),
    totalOutflows: minorUnitsToDecimalString(outflowsMinor, "NGN"),
    netCashFlow: minorUnitsToDecimalString(inflowsMinor - outflowsMinor, "NGN"),
    spendingByCategory: byCategory.map((row) => ({
      category: row.category,
      total: minorUnitsToDecimalString(row.totalMinor, "NGN"),
    })),
    flaggedCount,
  };
}
