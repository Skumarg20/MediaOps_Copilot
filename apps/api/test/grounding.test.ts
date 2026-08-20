import { describe, expect, it } from 'vitest';
import { LexicalGrounder, riskFromVerdict } from '@/modules/grounding/index.js';
import { groundingService } from '@/modules/grounding/index.js';
const { extractCitedIds, validateCitations, lexicalOverlap } = groundingService;
import type { Evidence } from '@/types.js';

const grounder = new LexicalGrounder();

const EVIDENCE: Evidence[] = [
  {
    id: 'error_codes:RENDER_TIMEOUT',
    source: 'vectorless',
    text: 'RENDER_TIMEOUT: Raised when a worker exceeds the render time budget for the job class without completing. The watchdog reaps the job and releases the worker slot.',
    meta: {},
  },
  {
    id: 'job:482',
    source: 'vectorless',
    text: 'Job 482 is failed with failure reason RENDER_TIMEOUT on worker-07, duration 1802 seconds, class 4k.',
    meta: {},
  },
];

describe('citation extraction', () => {
  it('reads inline markers and the trailing footer alike', () => {
    const answer = 'Job 482 timed out [job:482].\nCitations: job:482, error_codes:RENDER_TIMEOUT';
    expect(extractCitedIds(answer).sort()).toEqual(['error_codes:RENDER_TIMEOUT', 'job:482']);
  });

  it('does not punish a model that cites inline but omits the footer', () => {
    expect(extractCitedIds('The watchdog reaps it [error_codes:RENDER_TIMEOUT].')).toEqual([
      'error_codes:RENDER_TIMEOUT',
    ]);
  });

  it('deduplicates repeated citations', () => {
    expect(extractCitedIds('[job:482] and again [job:482]\nCitations: job:482')).toEqual(['job:482']);
  });

  it('ignores a "Citations: none" footer', () => {
    expect(extractCitedIds('No support found.\nCitations: none')).toEqual([]);
  });
});

describe('citation validation', () => {
  it('separates real ids from invented ones', () => {
    const result = validateCitations(['job:482', 'job:999'], EVIDENCE);
    expect(result.valid).toEqual(['job:482']);
    expect(result.invalid).toEqual(['job:999']);
  });

  it('is an exact-match check, not a similarity judgement', () => {
    // A near-miss id is still an invented source.
    expect(validateCitations(['job:48'], EVIDENCE).invalid).toEqual(['job:48']);
  });
});

describe('lexical overlap', () => {
  it('scores a faithful quotation near the top of the range', () => {
    const overlap = lexicalOverlap(
      'The watchdog reaps the job and releases the worker slot.',
      [EVIDENCE[0]!.text],
    );
    expect(overlap).toBeGreaterThan(0.9);
  });

  it('scores invented content near the bottom', () => {
    const overlap = lexicalOverlap(
      'Contact billing support to request a refund voucher for your subscription.',
      [EVIDENCE[0]!.text],
    );
    expect(overlap).toBeLessThan(0.25);
  });

  it('cannot be inflated by repeating one supported word', () => {
    // Types, not tokens: repetition must not manufacture support.
    const repeated = lexicalOverlap('watchdog watchdog watchdog unicorn', [EVIDENCE[0]!.text]);
    expect(repeated).toBeCloseTo(0.5, 2);
  });

  it('does not count citation markers as content', () => {
    const withMarkers = lexicalOverlap('[job:482] [error_codes:RENDER_TIMEOUT] unicorn', [
      EVIDENCE[0]!.text,
    ]);
    expect(withMarkers).toBe(0);
  });

  it('returns zero when there is no evidence to compare against', () => {
    expect(lexicalOverlap('anything at all', [])).toBe(0);
  });
});

describe('the abstention gate', () => {
  it('passes a well-grounded answer as High confidence', () => {
    const answer =
      'Job 482 is failed with failure reason RENDER_TIMEOUT on worker-07, duration 1802 seconds [job:482].';
    const verdict = grounder.score(answer, ['job:482'], EVIDENCE);

    expect(verdict.grounded).toBe(true);
    expect(verdict.band).toBe('High');
    expect(verdict.overlap).toBeGreaterThanOrEqual(0.45);
    expect(verdict.validCitations).toEqual(['job:482']);
    expect(riskFromVerdict(verdict)).toBe('low');
  });

  it('marks a heavily paraphrased but cited answer as Medium, not a refusal', () => {
    // Roughly a third of the terms are supported: real content, loosely worded.
    const answer =
      'Job 482 failed on worker-07 because processing overran the permitted window; consider draining that host [job:482].';
    const verdict = grounder.score(answer, ['job:482'], EVIDENCE);

    expect(verdict.overlap).toBeGreaterThanOrEqual(0.25);
    expect(verdict.overlap).toBeLessThan(0.45);
    expect(verdict.band).toBe('Medium');
    expect(verdict.grounded).toBe(true);
    expect(riskFromVerdict(verdict)).toBe('medium');
    expect(verdict.reason).toMatch(/verify before acting/i);
  });

  it('refuses outright when a citation is a phantom', () => {
    const answer = 'Job 999 failed due to a billing error [job:999].';
    const verdict = grounder.score(answer, ['job:999'], EVIDENCE);

    expect(verdict.grounded).toBe(false);
    expect(verdict.band).toBe('Low');
    expect(verdict.invalidCitations).toEqual(['job:999']);
    expect(verdict.reason).toContain('job:999');
    expect(riskFromVerdict(verdict)).toBe('high');
  });

  it('refuses a phantom citation even when the prose itself is faithful', () => {
    // The strongest gate: a fabricated source is fatal regardless of overlap.
    const answer =
      'The watchdog reaps the job and releases the worker slot [job:482] [runbook-invented#c9].';
    const verdict = grounder.score(
      answer,
      ['job:482', 'runbook-invented#c9'],
      EVIDENCE,
    );

    expect(verdict.grounded).toBe(false);
    expect(verdict.invalidCitations).toEqual(['runbook-invented#c9']);
  });

  it('refuses an answer that cites nothing', () => {
    const verdict = grounder.score('Just restart it, that usually works.', [], EVIDENCE);

    expect(verdict.grounded).toBe(false);
    expect(verdict.reason).toMatch(/cited no evidence/i);
  });

  it('refuses when overlap falls below the floor despite valid citations', () => {
    const answer =
      'Please open a billing ticket and request a proportional refund voucher from finance [job:482].';
    const verdict = grounder.score(answer, ['job:482'], EVIDENCE);

    expect(verdict.grounded).toBe(false);
    expect(verdict.overlap).toBeLessThan(0.25);
    expect(verdict.reason).toMatch(/withheld/);
  });

  it('refuses when no evidence was retrieved at all', () => {
    const verdict = grounder.score('Some answer.', [], []);
    expect(verdict.grounded).toBe(false);
    expect(verdict.reason).toMatch(/no evidence/i);
  });

  it('refuses an empty answer', () => {
    const verdict = grounder.score('   ', ['job:482'], EVIDENCE);
    expect(verdict.grounded).toBe(false);
    expect(verdict.reason).toMatch(/no answer text/i);
  });

  it('scores overlap against the cited evidence only', () => {
    // Citing one item must not borrow support from everything retrieved.
    const answer = 'Job 482 is failed on worker-07 with duration 1802 seconds [job:482].';
    const citedOnly = grounder.score(answer, ['job:482'], EVIDENCE);
    const citedWrong = grounder.score(answer, ['error_codes:RENDER_TIMEOUT'], EVIDENCE);

    expect(citedOnly.overlap).toBeGreaterThan(citedWrong.overlap);
  });
});
