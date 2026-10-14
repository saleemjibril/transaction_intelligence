import type { Direction, TransactionCategory } from "../../generated/prisma/enums";

export interface ClassificationResult {
  category: TransactionCategory;
  confidence: number; // 0..1
  reason: string;
}

export interface ClassificationInput {
  description: string;
  merchant: string | null;
  amountMinor: bigint;
  direction: Direction;
}

export interface ClassificationProvider {
  readonly name: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}

/**
 * Any provider failure (unavailable, rate-limited, malformed output) is
 * surfaced as a ProviderError so the worker can retry with backoff and
 * eventually fall back, without interrupting transaction ingestion.
 */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}
