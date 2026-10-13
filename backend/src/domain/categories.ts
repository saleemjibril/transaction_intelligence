import { TransactionCategory } from "../generated/prisma/enums";

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  REVENUE: "Revenue",
  PAYROLL: "Payroll",
  SOFTWARE: "Software",
  MARKETING: "Marketing",
  TRAVEL: "Travel",
  UTILITIES: "Utilities",
  RENT: "Rent",
  TAX: "Tax",
  TRANSFERS: "Transfers",
  BANKING_FEES: "Banking Fees",
  OTHER: "Other",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as TransactionCategory[];
