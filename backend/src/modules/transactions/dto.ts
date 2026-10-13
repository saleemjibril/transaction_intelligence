import type { Transaction } from "../../generated/prisma/client";
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
