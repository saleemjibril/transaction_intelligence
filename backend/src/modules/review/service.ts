import type { TransactionCategory } from "../../generated/prisma/enums";
import { FlagStatus, TransactionStatus } from "../../generated/prisma/enums";
import type { Db } from "../../db";
import { AppError } from "../../lib/errors";
import type { TransactionWithRelations } from "../transactions/dto";

export async function listForReview(db: Db, organizationId: string, limit = 50): Promise<TransactionWithRelations[]> {
  return db.transaction.findMany({
    where: { organizationId, status: TransactionStatus.REVIEW_REQUIRED },
    include: {
      flags: { where: { status: FlagStatus.OPEN }, orderBy: { createdAt: "asc" } },
      classificationLogs: true,
    },
    orderBy: { date: "desc" },
    take: limit,
  });
}

export async function resolveReview(
  db: Db,
  organizationId: string,
  id: string,
  action: "resolve" | "dismiss",
): Promise<TransactionWithRelations> {
  const existing = await db.transaction.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw new AppError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");
  }

  const flagStatus = action === "resolve" ? FlagStatus.RESOLVED : FlagStatus.DISMISSED;
  await db.$transaction(async (tx) => {
    await tx.transactionFlag.updateMany({
      where: { transactionId: id, status: FlagStatus.OPEN },
      data: { status: flagStatus },
    });
    await tx.transaction.update({ where: { id }, data: { status: TransactionStatus.REVIEWED } });
  });

  const updated = await db.transaction.findFirst({ where: { id }, include: { flags: true, classificationLogs: true } });
  if (!updated) {
    throw new AppError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");
  }
  return updated;
}

export async function correctCategory(
  db: Db,
  organizationId: string,
  id: string,
  actorId: string,
  category: TransactionCategory,
): Promise<TransactionWithRelations> {
  const existing = await db.transaction.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw new AppError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");
  }

  await db.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id }, data: { category } });
    await tx.classificationLog.create({
      data: {
        transactionId: id,
        source: "manual",
        category,
        previousCategory: existing.category,
        actorId,
        reason: "manual correction",
      },
    });
  });

  const updated = await db.transaction.findFirst({ where: { id }, include: { flags: true, classificationLogs: true } });
  if (!updated) {
    throw new AppError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");
  }
  return updated;
}
