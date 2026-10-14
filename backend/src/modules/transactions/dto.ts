import type { Prisma, Transaction } from "../../generated/prisma/client";
import { minorUnitsToDecimalString } from "../../lib/money";

/**
 * API representation of a transaction. The stored `amountMinor` bigint is
 * converted to a decimal string at this boundary so JSON never carries a
 * raw bigint or a floating-point number.
 */
export function toTransactionDTO(tx: Transaction) {
  return {
    id: tx.id,
    accountId: tx.accountId,
    externalRef: tx.externalRef,
    amount: minorUnitsToDecimalString(tx.amountMinor, tx.currency),
    direction: tx.direction,
    currency: tx.currency,
    description: tx.description,
    merchant: tx.merchant,
    date: tx.date.toISOString(),
    category: tx.category,
    status: tx.status,
    confidence: tx.confidence,
    createdAt: tx.createdAt.toISOString(),
  };
}

export type TransactionDTO = ReturnType<typeof toTransactionDTO>;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { flags: true; classificationLogs: true };
}>;

export function toTransactionDetailDTO(tx: TransactionWithRelations) {
  return {
    ...toTransactionDTO(tx),
    flags: tx.flags.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      explanation: f.explanation,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
    })),
    classificationLogs: tx.classificationLogs.map((l) => ({
      id: l.id,
      source: l.source,
      category: l.category,
      previousCategory: l.previousCategory,
      confidence: l.confidence,
      reason: l.reason,
      actorId: l.actorId,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}
