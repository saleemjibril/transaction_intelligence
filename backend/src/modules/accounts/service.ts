import type { Db } from "../../db";
import type { AccountType } from "../../generated/prisma/enums";
import { AppError } from "../../lib/errors";

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency?: string;
}

export function listAccounts(db: Db, organizationId: string) {
  return db.account.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
}

export async function createAccount(db: Db, organizationId: string, input: CreateAccountInput) {
  const existing = await db.account.findUnique({
    where: { organizationId_name: { organizationId, name: input.name } },
  });
  if (existing) {
    throw new AppError(409, "An account with this name already exists", "ACCOUNT_EXISTS");
  }

  return db.account.create({
    data: {
      organizationId,
      name: input.name,
      type: input.type,
      currency: input.currency ?? "NGN",
    },
  });
}
