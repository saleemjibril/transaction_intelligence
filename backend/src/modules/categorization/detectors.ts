import type { Transaction } from "../../generated/prisma/client";
import { FlagType, Severity, TransactionStatus, type TransactionCategory } from "../../generated/prisma/enums";
import type { Db } from "../../db";
import { formatNGN } from "../../lib/money";

export interface Detection {
  type: FlagType;
  severity: Severity;
  explanation: string;
}

export interface DetectorContext {
  db: Db;
  transaction: Transaction;
  confidence: number | null;
  category: TransactionCategory | null;
}

type Detector = (ctx: DetectorContext) => Promise<Detection[]>;

// ₦5,000,000.00 in kobo.
const LARGE_AMOUNT_THRESHOLD_MINOR = 500_000_000n;
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const NEAR_DUPLICATE_WINDOW_HOURS = 24;
const FREQUENCY_WINDOW_MINUTES = 60;
const FREQUENCY_THRESHOLD = 20;

const largeAmount: Detector = async ({ transaction }) => {
  if (transaction.amountMinor >= LARGE_AMOUNT_THRESHOLD_MINOR) {
    return [
      {
        type: FlagType.LARGE_AMOUNT,
        severity: Severity.HIGH,
        explanation: `Amount ${formatNGN(transaction.amountMinor)} exceeds the ${formatNGN(LARGE_AMOUNT_THRESHOLD_MINOR)} review threshold`,
      },
    ];
  }
  return [];
};

const lowConfidence: Detector = async ({ confidence }) => {
  if (confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD) {
    return [
      {
        type: FlagType.LOW_CONFIDENCE,
        severity: Severity.MEDIUM,
        explanation: `Classification confidence ${confidence.toFixed(2)} is below the ${LOW_CONFIDENCE_THRESHOLD} review threshold`,
      },
    ];
  }
  return [];
};

const nearDuplicate: Detector = async ({ db, transaction }) => {
  const windowMs = NEAR_DUPLICATE_WINDOW_HOURS * 3600 * 1000;
  const match = await db.transaction.findFirst({
    where: {
      organizationId: transaction.organizationId,
      id: { not: transaction.id },
      amountMinor: transaction.amountMinor,
      direction: transaction.direction,
      date: {
        gte: new Date(transaction.date.getTime() - windowMs),
        lte: new Date(transaction.date.getTime() + windowMs),
      },
      ...(transaction.merchant
        ? { merchant: transaction.merchant }
        : { description: transaction.description }),
    },
    orderBy: { date: "asc" },
  });

  if (match) {
    const key = transaction.merchant ? "merchant" : "description";
    return [
      {
        type: FlagType.NEAR_DUPLICATE,
        severity: Severity.MEDIUM,
        explanation: `Matches ${match.externalRef}: same amount, direction and ${key} within ${NEAR_DUPLICATE_WINDOW_HOURS} hours`,
      },
    ];
  }
  return [];
};

const unexpectedCategory: Detector = async ({ db, transaction, category }) => {
  if (!category || !transaction.merchant) {
    return [];
  }

  const prior = await db.transaction.findMany({
    where: {
      organizationId: transaction.organizationId,
      merchant: transaction.merchant,
      category: { not: null },
      status: { in: [TransactionStatus.CATEGORIZED, TransactionStatus.REVIEWED] },
      id: { not: transaction.id },
    },
    select: { category: true },
    take: 10,
  });

  const differing = prior.filter((p) => p.category !== category);
  if (prior.length >= 2 && differing.length === prior.length) {
    return [
      {
        type: FlagType.UNEXPECTED_CATEGORY,
        severity: Severity.MEDIUM,
        explanation: `Merchant "${transaction.merchant}" was previously categorised as ${prior[0]?.category}, but this was categorised as ${category}`,
      },
    ];
  }
  return [];
};

const frequency: Detector = async ({ db, transaction }) => {
  const windowMs = FREQUENCY_WINDOW_MINUTES * 60 * 1000;
  const count = await db.transaction.count({
    where: {
      organizationId: transaction.organizationId,
      accountId: transaction.accountId,
      date: { gte: new Date(transaction.date.getTime() - windowMs), lte: transaction.date },
    },
  });

  if (count > FREQUENCY_THRESHOLD) {
    return [
      {
        type: FlagType.FREQUENCY,
        severity: Severity.MEDIUM,
        explanation: `${count} transactions on this account within the last ${FREQUENCY_WINDOW_MINUTES} minutes`,
      },
    ];
  }
  return [];
};

const DETECTORS: Detector[] = [largeAmount, lowConfidence, nearDuplicate, unexpectedCategory, frequency];

export async function runDetectors(ctx: DetectorContext): Promise<Detection[]> {
  const results = await Promise.all(DETECTORS.map((detector) => detector(ctx)));
  return results.flat();
}
