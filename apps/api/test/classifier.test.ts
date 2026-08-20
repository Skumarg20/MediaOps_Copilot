import { describe, expect, it } from 'vitest';
import { LogisticTriageClassifier, classifierService } from '@/modules/classifier/index.js';
const { explainFeatures } = classifierService;
import { FEATURE_NAMES } from '@/modules/classifier/index.js';
const { extractFeatures } = classifierService;
import type { StructuredAnchors } from '@/types.js';

const classifier = new LogisticTriageClassifier();
const NO_ANCHORS: StructuredAnchors = { jobIds: [], errorCodes: [] };

function predict(query: string, anchors: StructuredAnchors = NO_ANCHORS) {
  return classifier.predict(query, { anchors, incidentMatchCount: 0 });
}

describe('feature extraction', () => {
  it('returns one value per declared feature, in order', () => {
    const vector = extractFeatures('why did job 482 fail', {
      anchors: { jobIds: ['482'], errorCodes: [] },
      incidentMatchCount: 2,
    });
    expect(vector).toHaveLength(FEATURE_NAMES.length);
  });

  it('flags structured anchors and question words', () => {
    const vector = extractFeatures('why did job 482 fail with RENDER_TIMEOUT', {
      anchors: { jobIds: ['482'], errorCodes: ['RENDER_TIMEOUT'] },
      incidentMatchCount: 2,
    });
    const byName = Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, vector[i]]));

    expect(byName.has_job_id).toBe(1);
    expect(byName.has_error_code).toBe(1);
    expect(byName.q_why).toBe(1);
    expect(byName.q_how).toBe(0);
    expect(byName.incident_match_count).toBe(2);
  });

  it('counts urgency phrases rather than merely detecting them', () => {
    const vector = extractFeatures('production down and all jobs are stuck', {
      anchors: NO_ANCHORS,
      incidentMatchCount: 0,
    });
    const urgency = vector[FEATURE_NAMES.indexOf('urgency_hits')] ?? 0;
    expect(urgency).toBeGreaterThanOrEqual(3);
  });
});

describe('triage prediction', () => {
  it('classifies an error-code lookup as a simple lookup', () => {
    const triage = predict('what does error code RENDER_TIMEOUT mean', {
      jobIds: [],
      errorCodes: ['RENDER_TIMEOUT'],
    });
    expect(triage.class).toBe('simple_lookup');
  });

  it('classifies an open-ended diagnostic question as complex', () => {
    expect(predict('why is my render slower than usual').class).toBe('complex_diagnostic');
  });

  it('classifies active incident language as urgent', () => {
    expect(predict('production down all jobs are stuck right now').class).toBe('urgent_incident');
  });

  it('returns a normalised probability distribution', () => {
    const triage = predict('how do I safely retry a stuck job');
    const total = Object.values(triage.scores).reduce((a, b) => a + b, 0);

    expect(total).toBeCloseTo(1, 3);
    expect(triage.confidence).toBeGreaterThan(0);
    expect(triage.confidence).toBeLessThanOrEqual(1);
  });

  it('surfaces exactly two signed feature contributions for the panel', () => {
    const triage = predict('why did job 482 fail', { jobIds: ['482'], errorCodes: [] });

    expect(triage.topFeatures).toHaveLength(2);
    for (const f of triage.topFeatures) {
      expect(FEATURE_NAMES).toContain(f.name as (typeof FEATURE_NAMES)[number]);
      expect(Number.isFinite(f.contribution)).toBe(true);
    }
  });

  it('ranks contributions by magnitude, so the panel shows what actually mattered', () => {
    const triage = predict('production down every job is stuck p1');
    const [first, second] = triage.topFeatures;

    expect(Math.abs(first!.contribution)).toBeGreaterThanOrEqual(Math.abs(second!.contribution));
  });

  it('is deterministic for a given query', () => {
    const a = predict('how do I safely retry a stuck job');
    const b = predict('how do I safely retry a stuck job');
    expect(a).toEqual(b);
  });

  it('does not crash on an empty query', () => {
    expect(() => predict('')).not.toThrow();
  });
});

describe('feature explanation', () => {
  it('renders contributions in operator language with signs', () => {
    const text = explainFeatures([
      { name: 'has_error_code', value: 1, contribution: 1.8 },
      { name: 'query_len_tokens', value: 14, contribution: -0.9 },
    ]);

    expect(text).toContain('contains a known error code');
    expect(text).toContain('+1.8');
    expect(text).toContain('query length 14 tokens');
    expect(text).toContain('−0.9');
  });

  it('says so plainly when nothing contributed', () => {
    expect(explainFeatures([])).toMatch(/no feature/i);
  });
});
