import { config } from "../../config";
import { DeepSeekProvider } from "./deepseek-provider";
import { MockProvider } from "./mock-provider";
import type { ClassificationProvider } from "./provider";
import { RulesProvider } from "./rules-provider";

export function createProvider(): ClassificationProvider {
  switch (config.CLASSIFICATION_PROVIDER) {
    case "deepseek":
      if (!config.DEEPSEEK_API_KEY) {
        throw new Error("DEEPSEEK_API_KEY is required when CLASSIFICATION_PROVIDER=deepseek");
      }
      return new DeepSeekProvider(config.DEEPSEEK_API_KEY, config.DEEPSEEK_MODEL);
    case "mock":
      return new MockProvider(config.MOCK_BEHAVIOR);
    default:
      return new RulesProvider();
  }
}
