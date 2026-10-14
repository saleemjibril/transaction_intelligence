import { Direction, TransactionCategory } from "../../generated/prisma/enums";
import type { ClassificationInput, ClassificationProvider, ClassificationResult } from "./provider";

// Ordered keyword -> category rules, matched against the lowercased
// description and merchant. More specific phrases come first.
const RULES: Array<{ category: TransactionCategory; keywords: string[] }> = [
  { category: TransactionCategory.BANKING_FEES, keywords: ["bank charge", "account maintenance", "service charge", "card fee", "atm fee"] },
  { category: TransactionCategory.PAYROLL, keywords: ["payroll", "salary", "wages", "salaries", "staff pay"] },
  { category: TransactionCategory.RENT, keywords: ["rent", "lease", "office space"] },
  { category: TransactionCategory.SOFTWARE, keywords: ["software", "saas", "subscription", "aws", "azure", "cloud", "slack", "hosting", "github", "domain", "fleetio"] },
  { category: TransactionCategory.MARKETING, keywords: ["marketing", "advert", "facebook ads", "google ads", "meta", "campaign", "promotion"] },
  { category: TransactionCategory.TRAVEL, keywords: ["travel", "flight", "airline", "air peace", "hotel", "fuel", "transport", "uber", "taxi"] },
  { category: TransactionCategory.UTILITIES, keywords: ["electricity", "power", "water", "utility", "internet", "ikeja electric"] },
  { category: TransactionCategory.TAX, keywords: ["tax", "vat", "firs", "inland revenue", "customs", "duty"] },
  { category: TransactionCategory.TRANSFERS, keywords: ["transfer", "moved funds", "interbank", "reserve account"] },
  { category: TransactionCategory.REVENUE, keywords: ["revenue", "payment received", "invoice", "sales", "customer payment", "contract", "delivery services"] },
];

export class RulesProvider implements ClassificationProvider {
  readonly name = "rules";

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const haystack = `${input.description} ${input.merchant ?? ""}`.toLowerCase();

    for (const rule of RULES) {
      const match = rule.keywords.find((keyword) => haystack.includes(keyword));
      if (match) {
        return { category: rule.category, confidence: 0.9, reason: `matched keyword "${match}"` };
      }
    }

    if (input.direction === Direction.CREDIT) {
      return { category: TransactionCategory.REVENUE, confidence: 0.5, reason: "no keyword matched; incoming credit assumed to be revenue" };
    }

    return { category: TransactionCategory.OTHER, confidence: 0.3, reason: "no keyword matched" };
  }
}
