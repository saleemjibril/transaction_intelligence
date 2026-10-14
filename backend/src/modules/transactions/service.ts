import type { Prisma, Transaction } from "../../generated/prisma/client";
import type { Direction, TransactionCategory, TransactionStatus } from "../../generated/prisma/enums";
import type { Db } from "../../db";
import { AppError, isUniqueViolation } from "../../lib/errors";
import { withIdempotency } from "../../lib/idempotency";
import { InvalidAmountError, decimalStringToMinorUnits } from "../../lib/money";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import { toTransactionDTO } from "./dto";
import { transactionInputSchema } from "./schemas";

export interface TransactionInput {
  externalRef: string;
  accountId: string;
  amount: string;
  direction: Direction;
  currency: string;
  description: string;
  merchant?: string;
  date: Date;
}

export async function createTransaction(
  db: Db,
  organizationId: string,
  input: TransactionInput,
): Promise<{ transaction: Transaction; duplicate: boolean }> {
  // The account must belong to this organisation. This check doubles as
  // tenant isolation: an account id from another org is "not found" here.
  const account = await db.account.findFirst({ where: { id: input.accountId, organizationId } });
  if (!account) {
    throw new AppError(400, "Account not found", "ACCOUNT_NOT_FOUND");
  }

  let amountMinor: bigint;
  try {
    amountMinor = decimalStringToMinorUnits(input.amount, input.currency);
  } catch (error) {
    if (error instanceof InvalidAmountError) {
      throw new AppError(400, error.message, "INVALID_AMOUNT");
    }
    throw error;
  }

  const existing = await db.transaction.findUnique({
    where: {
      organizationId_externalRef_accountId: {
        organizationId,
        externalRef: input.externalRef,
        accountId: input.accountId,
      },
    },
  });
  if (existing) {
    return { transaction: existing, duplicate: true };
  }

  try {
    const created = await db.transaction.create({
      data: {
        organizationId,
        accountId: input.accountId,
        externalRef: input.externalRef,
        amountMinor,
        direction: input.direction,
        currency: input.currency,
        description: input.description,
        merchant: input.merchant,
        date: input.date,
      },
    });
    return { transaction: created, duplicate: false };
  } catch (error) {
    // Concurrent duplicate: the unique constraint is the source of truth.
    if (isUniqueViolation(error)) {
      const existing = await db.transaction.findUnique({
        where: {
          organizationId_externalRef_accountId: {
            organizationId,
            externalRef: input.externalRef,
            accountId: input.accountId,
          },
        },
      });
      if (existing) {
        return { transaction: existing, duplicate: true };
      }
    }
    throw error;
  }
}

export function importSingle(
  db: Db,
  organizationId: string,
  input: TransactionInput,
  idempotencyKey?: string,
) {
  return withIdempotency(db, organizationId, idempotencyKey, async () => {
    const { transaction, duplicate } = await createTransaction(db, organizationId, input);
    if (duplicate) {
      return {
        statusCode: 409,
        body: {
          error: "DUPLICATE_TRANSACTION",
          message: "A transaction with this external reference already exists for this account",
          transactionId: transaction.id,
        },
      };
    }
    return { statusCode: 201, body: toTransactionDTO(transaction) };
  });
}

export function importBatch(
  db: Db,
  organizationId: string,
  rows: unknown[],
  idempotencyKey?: string,
) {
  return withIdempotency(db, organizationId, idempotencyKey, async () => {
    const imported: { index: number; transaction: ReturnType<typeof toTransactionDTO> }[] = [];
    const duplicates: { index: number; transactionId: string }[] = [];
    const failed: { index: number; reason: string }[] = [];

    for (let index = 0; index < rows.length; index++) {
      const parsed = transactionInputSchema.safeParse(rows[index]);
      if (!parsed.success) {
        failed.push({ index, reason: parsed.error.issues[0]?.message ?? "Invalid transaction" });
        continue;
      }

      try {
        const { transaction, duplicate } = await createTransaction(db, organizationId, parsed.data);
        if (duplicate) {
          duplicates.push({ index, transactionId: transaction.id });
        } else {
          imported.push({ index, transaction: toTransactionDTO(transaction) });
        }
      } catch (error) {
        if (error instanceof AppError) {
          failed.push({ index, reason: error.message });
        } else {
          throw error;
        }
      }
    }

    const body = { imported, duplicates, failed };
    const clean = failed.length === 0 && duplicates.length === 0;
    return { statusCode: clean ? 201 : 200, body };
  });
}

export interface ListTransactionsInput {
  search?: string;
  accountId?: string;
  category?: TransactionCategory;
  direction?: Direction;
  status?: TransactionStatus;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
}

export async function listTransactions(db: Db, organizationId: string, query: ListTransactionsInput) {
  const conditions: Prisma.TransactionWhereInput[] = [{ organizationId }];

  if (query.accountId) conditions.push({ accountId: query.accountId });
  if (query.category) conditions.push({ category: query.category });
  if (query.direction) conditions.push({ direction: query.direction });
  if (query.status) conditions.push({ status: query.status });

  if (query.search) {
    conditions.push({
      OR: [
        { description: { contains: query.search, mode: "insensitive" } },
        { merchant: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }

  if (query.from || query.to) {
    conditions.push({
      date: {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      },
    });
  }

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      const cursorDate = new Date(cursor.date);
      conditions.push({
        OR: [
          { date: { lt: cursorDate } },
          { date: cursorDate, id: { gt: cursor.id } },
        ],
      });
    }
  }

  const rows = await db.transaction.findMany({
    where: { AND: conditions },
    orderBy: [{ date: "desc" }, { id: "asc" }],
    take: query.limit + 1,
  });

  const hasMore = rows.length > query.limit;
  const data = rows.slice(0, query.limit);
  const last = data[data.length - 1];

  return {
    data,
    nextCursor: hasMore && last ? encodeCursor({ date: last.date.toISOString(), id: last.id }) : null,
  };
}

export async function getTransaction(db: Db, organizationId: string, id: string) {
  const tx = await db.transaction.findFirst({
    where: { id, organizationId },
    include: { flags: true, classificationLogs: true },
  });
  if (!tx) {
    throw new AppError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");
  }
  return tx;
}
