import { describe, expect, it } from "vitest";
import { Direction, TransactionCategory } from "../src/generated/prisma/enums";
import { RulesProvider } from "../src/modules/categorization/rules-provider";

const provider = new RulesProvider();

const cases: Array<[string, TransactionCategory]> = [
  ["Monthly staff payroll", TransactionCategory.PAYROLL],
  ["Office rent - Lagos", TransactionCategory.RENT],
  ["AWS infrastructure", TransactionCategory.SOFTWARE],
  ["Facebook ads campaign", TransactionCategory.MARKETING],
  ["Flight to Abuja", TransactionCategory.TRAVEL],
  ["Electricity bill", TransactionCategory.UTILITIES],
  ["FIRS quarterly VAT", TransactionCategory.TAX],
  ["Transfer to reserve account", TransactionCategory.TRANSFERS],
  ["Monthly account maintenance", TransactionCategory.BANKING_FEES],
  ["Customer payment - invoice 1042", TransactionCategory.REVENUE],
];

describe("RulesProvider", () => {
  it.each(cases)("classifies '%s' as %s", async (description, category) => {
    const result = await provider.classify({
      description,
      merchant: null,
      amountMinor: 1000n,
      direction: Direction.DEBIT,
    });
    expect(result.category).toBe(category);
    expect(result.confidence).toBe(0.9);
  });

  it("assumes an unmatched incoming credit is revenue", async () => {
    const result = await provider.classify({
      description: "mystery payment",
      merchant: null,
      amountMinor: 1000n,
      direction: Direction.CREDIT,
    });
    expect(result.category).toBe(TransactionCategory.REVENUE);
    expect(result.confidence).toBe(0.5);
  });

  it("defaults an unmatched debit to OTHER with low confidence", async () => {
    const result = await provider.classify({
      description: "mystery expense",
      merchant: null,
      amountMinor: 1000n,
      direction: Direction.DEBIT,
    });
    expect(result.category).toBe(TransactionCategory.OTHER);
    expect(result.confidence).toBe(0.3);
  });
});
