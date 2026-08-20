import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RationalePanel } from '@/components/RationalePanel';
import type { Citation, Rationale } from '@/lib/types';

const RATIONALE: Rationale = {
  path: {
    chosen: 'vectorless',
    why: 'Exact match on error code RENDER_TIMEOUT in the glossary — no embedding needed.',
    deterministic: true,
  },
  model: {
    chosen: 'qwen2.5:3b',
    why: 'Exploit: highest mean reward for complex_diagnostic queries (7.4 over 12 pulls).',
    exploring: false,
    arm_mean_reward: 7.4,
    arm_pulls: 12,
  },
  confidence: {
    band: 'High',
    why: 'All 2 citations resolve to retrieved evidence; 0.62 lexical overlap with cited text.',
  },
  triage: {
    class: 'complex_diagnostic',
    why: "Flagged by: contains 'why' (+1.8), query length 14 tokens (+0.9).",
  },
  evidence: [{ id: 'error_codes:RENDER_TIMEOUT', excerpt: 'Raised when a worker exceeds…' }],
};

const CITATIONS: Citation[] = [
  {
    id: 'error_codes:RENDER_TIMEOUT',
    source: 'vectorless',
    excerpt: 'Raised when a worker exceeds the render time budget for the job class.',
  },
];

describe('RationalePanel', () => {
  it('renders the path, arm and confidence decisions with their reasons', () => {
    render(<RationalePanel rationale={RATIONALE} citations={CITATIONS} overlapScore={0.62} />);

    // "vectorless" is both the path value and the citation's source badge, so
    // assert on the labelled row rather than the bare string.
    expect(screen.getByText('Path').parentElement).toHaveTextContent('vectorless');
    expect(screen.getByText('qwen2.5:3b')).toBeInTheDocument();
    expect(screen.getByText('Confidence').parentElement).toHaveTextContent('High');
    expect(screen.getByText(/no embedding needed/i)).toBeInTheDocument();
    expect(screen.getByText(/highest mean reward/i)).toBeInTheDocument();
    expect(screen.getByText(/lexical overlap/i)).toBeInTheDocument();
  });

  it('marks a deterministic route as such, so an operator knows it was not a guess', () => {
    render(<RationalePanel rationale={RATIONALE} citations={CITATIONS} />);
    expect(screen.getByText('deterministic')).toBeInTheDocument();
  });

  it('flags an exploring arm so an experiment is not mistaken for a verdict', () => {
    const exploring: Rationale = {
      ...RATIONALE,
      model: { ...RATIONALE.model, exploring: true, why: 'Explore: an ε=0.2 draw tried this arm.' },
    };

    render(<RationalePanel rationale={exploring} citations={CITATIONS} />);
    expect(screen.getByText('exploring')).toBeInTheDocument();
  });

  it('shows the classifier features that drove the triage class', () => {
    render(<RationalePanel rationale={RATIONALE} citations={CITATIONS} />);
    expect(screen.getByText(/Flagged by/)).toBeInTheDocument();
    expect(screen.getByText('complex_diagnostic')).toBeInTheDocument();
  });

  it('renders each citation with its id and a readable excerpt', () => {
    render(<RationalePanel rationale={RATIONALE} citations={CITATIONS} />);

    expect(screen.getByText('Citations (1)')).toBeInTheDocument();
    expect(screen.getByText('error_codes:RENDER_TIMEOUT')).toBeInTheDocument();
    expect(screen.getByText(/Raised when a worker exceeds/)).toBeInTheDocument();
  });

  it('explains an empty citation list as a withheld answer, not a missing one', () => {
    render(<RationalePanel rationale={RATIONALE} citations={[]} />);
    expect(screen.getByText(/withheld rather than asserted/i)).toBeInTheDocument();
  });
});
