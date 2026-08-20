'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { QueryBox } from '@/components/QueryBox';
import { RLPanel } from '@/components/RLPanel';
import { StatusPill } from '@/components/StatusPill';
import { TransactionTable } from '@/components/TransactionTable';
import { swrKeys } from '@/lib/api-client';

const LIMIT = 25;

/**
 * The console holds no business logic — it renders what the API decided.
 * Its only job beyond presentation is keeping the two views consistent: a
 * feedback click must visibly move both the row and the policy panel, or the
 * loop is invisible to the operator.
 */
export default function ConsolePage() {
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  function revalidateAll() {
    void mutate(swrKeys.transactions(LIMIT));
    void mutate(swrKeys.rlStats);
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-ink-800 pb-5">
        <div>
          <h1 className="text-xl font-semibold text-ink-200">MediaOps Copilot</h1>
          <p className="mt-1 text-sm text-ink-400">
            Routes before it retrieves · cites before it answers · learns from every rating.
          </p>
        </div>
        <StatusPill />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <QueryBox onPending={setPendingQuery} onAnswered={revalidateAll} />
          <TransactionTable
            limit={LIMIT}
            pendingQuery={pendingQuery}
            onRated={revalidateAll}
          />
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <RLPanel />
        </aside>
      </div>
    </main>
  );
}
