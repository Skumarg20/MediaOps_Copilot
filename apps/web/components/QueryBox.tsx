'use client';

import { useState } from 'react';
import { ApiError, postQuery } from '@/lib/api-client';

type Props = {
  onPending: (query: string | null) => void;
  onAnswered: () => void;
};

const EXAMPLES = [
  'what does error code RENDER_TIMEOUT mean',
  'why is my render slower than usual',
  'why did job 482 fail',
  'how do I safely retry a stuck job',
];

export function QueryBox({ onPending, onAnswered }: Props) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    onPending(trimmed);

    try {
      await postQuery(trimmed);
      setQuery('');
      onAnswered();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 503
            ? 'No retrieval path is available right now — check /health.'
            : err.message
          : 'Could not reach the API.',
      );
    } finally {
      setBusy(false);
      onPending(null);
    }
  }

  return (
    <section className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(query);
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about a job, an error code, or why something is slow…"
          aria-label="Query"
          disabled={busy}
          className="flex-1 rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200 outline-none transition placeholder:text-ink-600 focus:border-signal-info/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || query.trim().length === 0}
          className="rounded-md border border-signal-info/50 bg-signal-info/10 px-4 py-2 text-sm text-signal-info transition hover:bg-signal-info/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            onClick={() => void submit(example)}
            className="rounded border border-ink-700 px-2 py-0.5 font-mono text-[11px] text-ink-400 transition hover:border-signal-info/40 hover:text-signal-info disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-signal-bad">
          {error}
        </p>
      ) : null}
    </section>
  );
}
