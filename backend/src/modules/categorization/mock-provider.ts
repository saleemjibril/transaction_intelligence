import { TransactionCategory } from "../../generated/prisma/enums";
import { ProviderError, type ClassificationInput, type ClassificationProvider, type ClassificationResult } from "./provider";

export type MockBehavior = "ok" | "fail" | "rate-limit" | "invalid";

/**
 * Deterministic fault-injection provider. Lets tests (and a reviewer running
 * CLASSIFICATION_PROVIDER=mock) exercise the slow / unavailable / rate-limited
 * / invalid-response paths on demand, without a network or an API key.
 */
export class MockProvider implements ClassificationProvider {
  readonly name = "mock";

  constructor(
    private readonly behavior: MockBehavior = "ok",
    private readonly latencyMs = 0,
  ) {}

  async classify(_input: ClassificationInput): Promise<ClassificationResult> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    switch (this.behavior) {
      case "ok":
        return { category: TransactionCategory.OTHER, confidence: 0.7, reason: "mock provider (deterministic)" };
      case "fail":
        throw new ProviderError("mock provider unavailable");
      case "rate-limit":
        throw new ProviderError("mock provider rate limited (429)");
      case "invalid":
        throw new ProviderError("mock provider returned an invalid response");
    }
  }
}
