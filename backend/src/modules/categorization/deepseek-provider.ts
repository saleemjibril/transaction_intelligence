import { z } from "zod";
import { TransactionCategory } from "../../generated/prisma/enums";
import { ProviderError, type ClassificationInput, type ClassificationProvider, type ClassificationResult } from "./provider";

const resultSchema = z.object({
  category: z.enum(TransactionCategory),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

// The prompt must mention "json" for DeepSeek's json_object mode to work.
const SYSTEM_PROMPT = [
  "You categorise financial transactions. Respond with JSON only, in this exact shape:",
  '{"category": "REVENUE|PAYROLL|SOFTWARE|MARKETING|TRAVEL|UTILITIES|RENT|TAX|TRANSFERS|BANKING_FEES|OTHER", "confidence": 0.0-1.0, "reason": "short justification"}',
].join("\n");

export class DeepSeekProvider implements ClassificationProvider {
  readonly name = "deepseek";

  constructor(
    private readonly apiKey: string,
    private readonly model = "deepseek-chat",
    private readonly baseUrl = "https://api.deepseek.com",
  ) {}

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                description: input.description,
                merchant: input.merchant,
                amountMinor: input.amountMinor.toString(),
                direction: input.direction,
              }),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });
    } catch (error) {
      throw new ProviderError(`DeepSeek request failed: ${(error as Error).message}`);
    }

    if (!response.ok) {
      throw new ProviderError(`DeepSeek API returned ${response.status}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new ProviderError("DeepSeek returned an empty response");
    }

    // Validate untrusted model output at the boundary. Valid JSON is not
    // the same as valid data: the shape and category set are enforced here.
    const parsed = resultSchema.safeParse(parseJsonSafely(content));
    if (!parsed.success) {
      throw new ProviderError("DeepSeek returned an invalid classification");
    }
    return parsed.data;
  }
}

function parseJsonSafely(content: string): unknown {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new ProviderError("DeepSeek returned malformed JSON");
  }
}
