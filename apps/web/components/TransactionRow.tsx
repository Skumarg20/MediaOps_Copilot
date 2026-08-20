'use client';

import { useState } from 'react';
import { FeedbackButtons } from './FeedbackButtons';
import { RationalePanel } from './RationalePanel';
import type { TransactionRecord } from '@/lib/types';

type Props = {
  transaction: TransactionRecord;
  onRated?: () => void;
};

const TRIAGE_LABEL: Record<string, string> = {
  simple_lookup: 'lookup',
  complex_diagnostic: 'diagnostic',
  urgent_incident: 'incident',
};

/**
 * One transaction in the feed.
 *
 * Ungrounded answers get a distinct amber treatment so an abstention reads as
 * deliberate honesty, not as an error the operator should chase.
 */
export function TransactionRow({ transaction: tx, onRated }: Props) {
  const [expanded, setExpanded] = useState(false);

  const abstentionAwareTone = tx.grounded
    ? 'border-ink-700'
    : 'border-signal-warn/40 bg-signal-warn/[0.04]';

  return (
    <li className={`rounded-md border ${abstentionAwareTone} bg-ink-900/40`}>
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex-1 text-left"
          >
            <p className="text-sm font-medium text-ink-200">{tx.query}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-400">
              {tx.answer}
            </p>
          </button>

          <span className="shrink-0 text-xs text-ink-400" title={tx.created_at}>
            {new Date(tx.created_at).toLocaleTimeString()}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <Badge>{tx.path}</Badge>
          <Badge>{tx.model}</Badge>
          <Badge>{TRIAGE_LABEL[tx.triage_class] ?? tx.triage_class}</Badge>
          <Badge>{tx.latency_ms} ms</Badge>

          {tx.grounded ? (
            <Badge tone="ok">grounded · {tx.confidence_band}</Badge>
          ) : (
            <Badge tone="warn">abstained</Badge>
          )}

          {tx.exploring ? <Badge tone="warn">exploring</Badge> : null}
          {tx.degraded ? <Badge tone="warn">degraded</Badge> : null}
          {tx.feedback ? (
            <Badge tone={tx.feedback.score > 0 ? 'ok' : 'bad'}>
              reward {tx.feedback.reward.toFixed(2)}
            </Badge>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <FeedbackButtons
              transactionId={tx.id}
              existingScore={tx.feedback?.score ?? null}
              onRated={onRated}
            />
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="rounded border border-ink-600 px-2 py-0.5 text-xs text-ink-400 transition hover:border-signal-info/50 hover:text-signal-info"
            >
              {expanded ? 'Hide why' : 'Why?'}
            </button>
          </div>
        </div>
      </div>

      {expanded ? (
        <RationalePanel
          rationale={tx.rationale}
          citations={tx.citations}
          overlapScore={tx.overlap_score}
        />
      ) : null}
    </li>
  );
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
}) {
  const styles = {
    neutral: 'border-ink-600 text-ink-400',
    ok: 'border-signal-ok/40 bg-signal-ok/10 text-signal-ok',
    warn: 'border-signal-warn/40 bg-signal-warn/10 text-signal-warn',
    bad: 'border-signal-bad/40 bg-signal-bad/10 text-signal-bad',
  } as const;

  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono ${styles[tone]}`}>{children}</span>
  );
}
