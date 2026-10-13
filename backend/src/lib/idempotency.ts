import type { Prisma } from "../generated/prisma/client";
import type { Db } from "../db";
import { isUniqueViolation } from "./errors";

export interface IdempotentResult {
  statusCode: number;
  body: unknown;
}

/**
 * Run `handler` once per idempotency key. A repeated request with the same
 * key replays the stored response instead of executing again. The unique
 * constraint on (organizationId, key) makes the claim safe under concurrency:
 * if two requests race, one wins the insert and the other re-reads the stored
 * response.
 */
export async function withIdempotency(
  db: Db,
  organizationId: string,
  key: string | undefined,
  handler: () => Promise<IdempotentResult>,
): Promise<IdempotentResult> {
  if (!key) {
    return handler();
  }

  const existing = await db.idempotencyKey.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (existing) {
    return { statusCode: existing.statusCode, body: existing.responseBody };
  }

  const result = await handler();

  try {
    await db.idempotencyKey.create({
      data: {
        organizationId,
        key,
        statusCode: result.statusCode,
        responseBody: result.body as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const stored = await db.idempotencyKey.findUnique({
        where: { organizationId_key: { organizationId, key } },
      });
      if (stored) {
        return { statusCode: stored.statusCode, body: stored.responseBody };
      }
    }
    throw error;
  }

  return result;
}
