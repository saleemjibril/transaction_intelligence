import { z } from "zod";
import { Direction, TransactionCategory, TransactionStatus } from "../../generated/prisma/enums";

// Amount is a non-negative decimal string. Decimal-place limits are enforced
// by the money layer (per currency), not duplicated here.
export const transactionInputSchema = z.object({
  externalRef: z.string().min(1).max(200),
  accountId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  direction: z.enum(Direction),
  currency: z.string().default("NGN"),
  description: z.string().min(1),
  merchant: z.string().optional(),
  date: z.coerce.date(),
});

export const batchImportSchema = z.object({
  transactions: z.array(z.unknown()).min(1).max(1000),
});

export const listTransactionsQuerySchema = z.object({
  search: z.string().optional(),
  accountId: z.string().optional(),
  category: z.enum(TransactionCategory).optional(),
  direction: z.enum(Direction).optional(),
  status: z.enum(TransactionStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
