import type { Transaction } from "../../generated/prisma/client";
import { FlagType, Severity, TransactionStatus } from "../../generated/prisma/enums";
import type { Db } from "../../db";
import { runDetectors, type Detection } from "./detectors";
import { ProviderError, type ClassificationProvider } from "./provider";
import { RulesProvider } from "./rules-provider";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 30_000;

function backoffDate(attempts: number): Date {
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), 60 * 60 * 1000);
  return new Date(Date.now() + delay);
}

/**
 * Claim up to `batchSize` pending transactions using FOR UPDATE SKIP LOCKED,
 * which lets multiple workers share the queue safely: each row is locked by
 * exactly one worker, and a worker never blocks on another's locks. The
 * claimed rows get a short lease so a crashed worker does not lose them
 * forever.
 */
export async function claimPending(db: Db, batchSize: number): Promise<Transaction[]> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Transaction"
      WHERE status::text = ${TransactionStatus.PENDING_CATEGORIZATION}
        AND "nextCategorizationAt" <= now()
      ORDER BY "nextCategorizationAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((r) => r.id);
    await tx.transaction.updateMany({
      where: { id: { in: ids } },
      data: { nextCategorizationAt: new Date(Date.now() + LEASE_MS) },
    });
    return tx.transaction.findMany({ where: { id: { in: ids } } });
  });
}

export async function processOne(db: Db, provider: ClassificationProvider, transaction: Transaction): Promise<void> {
  const input = {
    description: transaction.description,
    merchant: transaction.merchant,
    amountMinor: transaction.amountMinor,
    direction: transaction.direction,
  };

  try {
    const result = await provider.classify(input);
    const detections = await runDetectors({
      db,
      transaction,
      confidence: result.confidence,
      category: result.category,
    });
    await commitSuccess(db, provider, transaction, result, detections);
  } catch (error) {
    if (error instanceof ProviderError) {
      await commitFailure(db, transaction, error.message);
      return;
    }
    throw error;
  }
}

async function commitSuccess(
  db: Db,
  provider: ClassificationProvider,
  transaction: Transaction,
  result: { category: Transaction["category"]; confidence: number; reason: string },
  detections: Detection[],
): Promise<void> {
  const status = detections.length > 0 ? TransactionStatus.REVIEW_REQUIRED : TransactionStatus.CATEGORIZED;

  await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        category: result.category,
        confidence: result.confidence,
        status,
        categorizedAt: new Date(),
        categorizationAttempts: 0,
        categorizationError: null,
      },
    });
    await tx.classificationLog.create({
      data: {
        transactionId: transaction.id,
        source: provider.name,
        category: result.category,
        confidence: result.confidence,
        reason: result.reason,
      },
    });
    for (const detection of detections) {
      await tx.transactionFlag.create({
        data: {
          transactionId: transaction.id,
          type: detection.type,
          severity: detection.severity,
          explanation: detection.explanation,
        },
      });
    }
  });
}

async function commitFailure(db: Db, transaction: Transaction, errorMessage: string): Promise<void> {
  const attempts = transaction.categorizationAttempts + 1;

  if (attempts < MAX_ATTEMPTS) {
    await db.transaction.update({
      where: { id: transaction.id },
      data: {
        categorizationAttempts: attempts,
        categorizationError: errorMessage,
        nextCategorizationAt: backoffDate(attempts),
      },
    });
    return;
  }

  // Dead-letter: after repeated failures, classify with the deterministic
  // rules provider so the transaction is still usable, and flag it for review.
  const fallback = new RulesProvider();
  const result = await fallback.classify({
    description: transaction.description,
    merchant: transaction.merchant,
    amountMinor: transaction.amountMinor,
    direction: transaction.direction,
  });

  await db.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        category: result.category,
        confidence: result.confidence * 0.5,
        status: TransactionStatus.REVIEW_REQUIRED,
        categorizedAt: new Date(),
        categorizationAttempts: attempts,
        categorizationError: errorMessage,
      },
    });
    await tx.classificationLog.create({
      data: {
        transactionId: transaction.id,
        source: fallback.name,
        category: result.category,
        confidence: result.confidence * 0.5,
        reason: `${result.reason}; primary provider failed ${attempts} times`,
      },
    });
    await tx.transactionFlag.create({
      data: {
        transactionId: transaction.id,
        type: FlagType.LOW_CONFIDENCE,
        severity: Severity.MEDIUM,
        explanation: `Primary provider failed ${attempts} times; classified by fallback rules`,
      },
    });
  });
}

export interface WorkerOptions {
  batchSize?: number;
  pollMs?: number;
}

export function startWorker(db: Db, provider: ClassificationProvider, options: WorkerOptions = {}) {
  const batchSize = options.batchSize ?? 50;
  const pollMs = options.pollMs ?? 5000;
  let running = true;

  const loop = async () => {
    while (running) {
      let processed = 0;
      try {
        const claimed = await claimPending(db, batchSize);
        for (const transaction of claimed) {
          await processOne(db, provider, transaction);
        }
        processed = claimed.length;
      } catch (error) {
        console.error("categorization worker error", error);
      }
      if (processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    }
  };

  void loop();

  return {
    stop() {
      running = false;
    },
  };
}
