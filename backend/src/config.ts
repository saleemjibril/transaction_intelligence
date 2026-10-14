import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  CLASSIFICATION_PROVIDER: z.enum(["rules", "mock", "deepseek"]).default("rules"),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  MOCK_BEHAVIOR: z.enum(["ok", "fail", "rate-limit", "invalid"]).default("ok"),
  CATEGORIZATION_POLL_MS: z.coerce.number().int().min(100).default(5000),
  // Retry backoff between classification attempts. Lower it to demonstrate
  // the outage/dead-letter path quickly (e.g. 2000).
  CATEGORIZATION_BACKOFF_MS: z.coerce.number().int().min(100).default(30000),
});

export const config = envSchema.parse(process.env);
