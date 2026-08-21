import type {
  FeedbackResponse,
  HealthResponse,
  QueryResponse,
  RlStats,
  TransactionRecord,  FeedbackScore
} from './types';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; message?: string; details?: unknown }
      | null;
    throw new ApiError(
      body?.message ?? body?.error ?? `request failed with ${res.status}`,
      res.status,
      body?.details,
    );
  }

  return (await res.json()) as T;
}

export function postQuery(query: string): Promise<QueryResponse> {
  return request<QueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export function postFeedback(
  transactionId: string,
  score: FeedbackScore,
): Promise<FeedbackResponse> {
  return request<FeedbackResponse>('/feedback', {
    method: 'POST',
    body: JSON.stringify({ transaction_id: transactionId, score }),
  });
}

export function fetchTransactions(
  limit = 25,
): Promise<{ transactions: TransactionRecord[]; count: number }> {
  return request(`/transactions?limit=${limit}`);
}

export function fetchRlStats(): Promise<RlStats> {
  return request<RlStats>('/rl/stats');
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  return (await res.json()) as HealthResponse;
}

export const swrKeys = {
  transactions: (limit: number) => `transactions:${limit}`,
  rlStats: 'rl-stats',
  health: 'health',
} as const;
