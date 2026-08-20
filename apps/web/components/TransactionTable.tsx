'use client';

import useSWR from 'swr';
import { fetchTransactions, swrKeys } from '@/lib/api-client';
import { TransactionRow } from './TransactionRow';
import type { TransactionRecord } from '@/lib/types';

type Props = {
  limit?: number;
  /** Rendered above the feed while a query is in flight. */
  pendingQuery?: string | null;
  onRated?: () => void;
};

export function TransactionTable({ limit = 25, pendingQuery, onRated }: Props) {
  const { data, error, isLoading, mutate } = useSWR(
    swrKeys.transactions(limit),
    () => fetchTransactions(limit),
    { refreshInterval: 4000, keepPreviousData: true },
  );

  const transactions: TransactionRecord[] = data?.transactions ?? [];

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
          Recent transactions
        </h2>
        <span className="text-xs text-ink-400">
          {data ? `${data.count} shown` : isLoading ? 'loading…' : ''}
        </span>
      </header>

      {error ? (
        <p className="rounded border border-signal-bad/40 bg-signal-bad/10 px-3 py-2 text-sm text-signal-bad">
          Could not reach the API. Is it running on port 8080?
        </p>
      ) : null}

      <ul className="space-y-2">
        {pendingQuery ? (
          <li className="animate-pulse rounded-md border border-ink-700 bg-ink-900/40 px-4 py-3">
            <p className="text-sm font-medium text-ink-200">{pendingQuery}</p>
            <p className="mt-1 text-sm text-ink-400">Routing, retrieving, verifying…</p>
          </li>
        ) : null}

        {transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            onRated={() => {
              void mutate();
              onRated?.();
            }}
          />
        ))}
      </ul>

      {!isLoading && transactions.length === 0 && !pendingQuery ? (
        <p className="rounded border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-ink-400">
          No transactions yet. Ask something above — try{' '}
          <code className="font-mono text-signal-info">
            what does error code RENDER_TIMEOUT mean
          </code>{' '}
          and{' '}
          <code className="font-mono text-signal-info">why is my render slower than usual</code>.
        </p>
      ) : null}
    </section>
  );
}
