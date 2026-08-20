'use client';

import { useState } from 'react';
import { ApiError, postFeedback } from '@/lib/api-client';
import type { FeedbackResponse, FeedbackScore } from '@/lib/types';

type Props = {
  transactionId: string;
  /** Existing rating, when the transaction was already scored. */
  existingScore?: number | null;
  /** Called after a successful post so the caller can revalidate its views. */
  onRated?: (result: FeedbackResponse) => void;
};

/**
 * Optimistic, but honest: a failed POST rolls the row back rather than leaving
 * a rating on screen that the policy never received.
 *
 * Scores are normalised on the way in: a row written before the score contract
 * was fixed stores -1 for unhelpful. The migration rewrites those to 0, but
 * normalising here too means a stale cache or an older API never renders a rated
 * transaction as unrated.
 */
export function FeedbackButtons({ transactionId, existingScore, onRated }: Props) {
  const normaliseLegacyScore = (value: number | null | undefined): FeedbackScore | null =>
    value === null || value === undefined ? null : value === 1 ? 1 : 0;

  const [score, setScore] = useState<FeedbackScore | null>(normaliseLegacyScore(existingScore));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rated = score !== null;

  async function rate(next: FeedbackScore) {
    if (rated || pending) return;

    const previous = score;
    setScore(next);
    setPending(true);
    setError(null);

    try {
      const result = await postFeedback(transactionId, next);
      onRated?.(result);
    } catch (err) {
      setScore(previous);
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Already rated'
          : 'Could not record feedback',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Mark answer helpful"
        aria-pressed={score === 1}
        disabled={rated || pending}
        onClick={() => rate(1)}
        className={`rounded border px-2 py-0.5 text-xs transition ${
          score === 1
            ? 'border-signal-ok/60 bg-signal-ok/15 text-signal-ok'
            : 'border-ink-600 text-ink-400 hover:border-signal-ok/50 hover:text-signal-ok'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        Helpful
      </button>

      <button
        type="button"
        aria-label="Mark answer unhelpful"
        aria-pressed={score === 0}
        disabled={rated || pending}
        onClick={() => rate(0)}
        className={`rounded border px-2 py-0.5 text-xs transition ${
          score === 0
            ? 'border-signal-bad/60 bg-signal-bad/15 text-signal-bad'
            : 'border-ink-600 text-ink-400 hover:border-signal-bad/50 hover:text-signal-bad'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        Unhelpful
      </button>

      {error ? (
        <span role="status" className="text-xs text-signal-warn">
          {error}
        </span>
      ) : null}
    </div>
  );
}
