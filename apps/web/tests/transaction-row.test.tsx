import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionRow } from '@/components/TransactionRow';
import type { TransactionRecord } from '@/lib/types';

const BASE: TransactionRecord = {
  id: 'tx-1',
  query: 'what does error code RENDER_TIMEOUT mean',
  answer: 'RENDER_TIMEOUT is raised when a worker exceeds its render budget [error_codes:RENDER_TIMEOUT].',
  path: 'vectorless',
  model: 'llama3.2:3b',
  triage_class: 'simple_lookup',
  latency_ms: 940,
  grounded: true,
  overlap_score: 0.62,
  confidence_band: 'High',
  hallucination_penalty: 0,
  exploring: false,
  degraded: false,
  rationale: {
    path: { chosen: 'vectorless', why: 'Exact match on error code.', deterministic: true },
    model: {
      chosen: 'llama3.2:3b',
      why: 'Exploit: highest mean reward.',
      exploring: false,
      arm_mean_reward: 7.4,
      arm_pulls: 12,
    },
    confidence: { band: 'High', why: 'All citations resolve.' },
    triage: { class: 'simple_lookup', why: 'Flagged by: contains a known error code (+1.8).' },
    evidence: [],
  },
  citations: [
    {
      id: 'error_codes:RENDER_TIMEOUT',
      source: 'vectorless',
      excerpt: 'Raised when a worker exceeds the render time budget.',
    },
  ],
  created_at: '2026-08-20T09:00:00.000Z',
  feedback: null,
};

describe('TransactionRow', () => {
  it('summarises the decision on one line', () => {
    render(<TransactionRow transaction={BASE} />);

    expect(screen.getByText(BASE.query)).toBeInTheDocument();
    expect(screen.getByText('vectorless')).toBeInTheDocument();
    expect(screen.getByText('llama3.2:3b')).toBeInTheDocument();
    expect(screen.getByText('940 ms')).toBeInTheDocument();
    expect(screen.getByText(/grounded · High/)).toBeInTheDocument();
  });

  it('renders an abstention distinctly from a grounded answer', () => {
    const abstained: TransactionRecord = {
      ...BASE,
      grounded: false,
      confidence_band: 'Low',
      answer: "I don't know. The available evidence does not support an answer.",
      citations: [],
    };

    render(<TransactionRow transaction={abstained} />);

    expect(screen.getByText('abstained')).toBeInTheDocument();
    expect(screen.queryByText(/grounded/)).not.toBeInTheDocument();
  });

  it('marks a degraded answer so the operator knows a fallback was used', () => {
    render(<TransactionRow transaction={{ ...BASE, degraded: true }} />);
    expect(screen.getByText('degraded')).toBeInTheDocument();
  });

  it('shows the realised reward once the transaction has been rated', () => {
    render(
      <TransactionRow
        transaction={{
          ...BASE,
          feedback: { score: 1, reward: 9.06, created_at: '2026-08-20T09:01:00.000Z' },
        }}
      />,
    );
    expect(screen.getByText('reward 9.06')).toBeInTheDocument();
  });

  it('reveals the rationale panel on demand rather than by default', async () => {
    render(<TransactionRow transaction={BASE} />);

    expect(screen.queryByText('Citations (1)')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Why?' }));
    expect(screen.getByText('Citations (1)')).toBeInTheDocument();
  });

  it('does not offer a rating control that would double-count an existing one', () => {
    render(
      <TransactionRow
        transaction={{
          ...BASE,
          feedback: { score: 1, reward: 9.06, created_at: '2026-08-20T09:01:00.000Z' },
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mark answer helpful' })).toBeDisabled();
  });
});
