export interface Transaction {
  id: string;
  accountId: string;
  externalRef: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  currency: string;
  description: string;
  merchant: string | null;
  date: string;
  category: string | null;
  status: string;
  confidence: number | null;
  createdAt: string;
}

export interface Flag {
  id: string;
  type: string;
  severity: string;
  explanation: string;
  status: string;
  createdAt: string;
}

export interface ClassificationLog {
  id: string;
  source: string;
  category: string | null;
  previousCategory: string | null;
  confidence: number | null;
  reason: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface TransactionDetail extends Transaction {
  flags: Flag[];
  classificationLogs: ClassificationLog[];
}

export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
}

export interface Category {
  value: string;
  label: string;
}

export interface DashboardSummary {
  totalInflows: string;
  totalOutflows: string;
  netCashFlow: string;
  spendingByCategory: Array<{ category: string; total: string }>;
  flaggedCount: number;
}

export interface User {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}

export interface ImportInput {
  externalRef: string;
  accountId: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  currency?: string;
  description: string;
  merchant?: string;
  date: string;
}

export interface BatchResult {
  imported: Array<{ index: number; transaction: Transaction }>;
  duplicates: Array<{ index: number; transactionId: string }>;
  failed: Array<{ index: number; reason: string }>;
}
