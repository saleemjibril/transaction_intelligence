import type { Account, BatchResult, Category, DashboardSummary, ImportInput, Transaction, TransactionDetail, User } from "./types";

const API = "/api/v1";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) {
    headers.set("content-type", "application/json");
  }
  const token = localStorage.getItem("token");
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.assign("/login");
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string } | null)?.message ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getAccounts: () => request<Account[]>("/accounts"),
  getCategories: () => request<Category[]>("/categories"),
  getDashboard: () => request<DashboardSummary>("/dashboard/summary"),

  getTransactions: (params: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        query.set(key, value);
      }
    }
    return request<{ data: Transaction[]; nextCursor: string | null }>(`/transactions?${query}`);
  },

  getTransaction: (id: string) => request<TransactionDetail>(`/transactions/${id}`),
  getReview: () => request<{ data: TransactionDetail[] }>("/review"),
  correctCategory: (id: string, category: string) =>
    request<TransactionDetail>(`/transactions/${id}/category`, {
      method: "PATCH",
      body: JSON.stringify({ category }),
    }),
  resolveReview: (id: string, action: "resolve" | "dismiss") =>
    request<TransactionDetail>(`/transactions/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  importSingle: (input: ImportInput) =>
    request<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  importBatch: (transactions: unknown[]) =>
    request<BatchResult>("/transactions/batch", {
      method: "POST",
      body: JSON.stringify({ transactions }),
    }),
};
