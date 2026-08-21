import type { StructuredAnchors } from '@/types.js';

export const FEATURE_NAMES = [
  'query_len_tokens',
  'has_job_id',
  'has_error_code',
  'q_why',
  'q_how',
  'q_what',
  'urgency_hits',
  'incident_match_count',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export const URGENCY_LEXICON = [
  'production down',
  'prod down',
  'outage',
  'p1',
  'sev1',
  'urgent',
  'asap',
  'critical',
  'stuck',
  'all jobs',
  'every job',
  'everything is',
  'customers are',
  'nothing is',
  'fleet is',
  'right now',
  'blocked',
] as const;

export type FeatureInput = {
  anchors: StructuredAnchors;
  incidentMatchCount: number;
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_#\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countLexiconHits(lower: string): number {
  let hits = 0;
  for (const phrase of URGENCY_LEXICON) {
    if (lower.includes(phrase)) hits += 1;
  }
  return hits;
}

export function extractFeatures(query: string, input: FeatureInput): number[] {
  const lower = query.toLowerCase();
  const tokens = tokenize(query);

  return [
    tokens.length,
    input.anchors.jobIds.length > 0 ? 1 : 0,
    input.anchors.errorCodes.length > 0 ? 1 : 0,
    /\bwhy\b/.test(lower) ? 1 : 0,
    /\bhow\b/.test(lower) ? 1 : 0,
    /\bwhat\b/.test(lower) ? 1 : 0,
    countLexiconHits(lower),
    input.incidentMatchCount,
  ];
}

export function featureRecord(vector: number[]): Record<FeatureName, number> {
  const out = {} as Record<FeatureName, number>;
  FEATURE_NAMES.forEach((name, i) => {
    out[name] = vector[i] ?? 0;
  });
  return out;
}


export const FEATURE_LABELS: Record<FeatureName, (value: number) => string> = {
  query_len_tokens: (v) => `query length ${v} tokens`,
  has_job_id: (v) => (v ? 'contains a known job ID' : 'no job ID present'),
  has_error_code: (v) => (v ? 'contains a known error code' : 'no error code present'),
  q_why: (v) => (v ? "contains 'why'" : "no 'why'"),
  q_how: (v) => (v ? "contains 'how'" : "no 'how'"),
  q_what: (v) => (v ? "contains 'what'" : "no 'what'"),
  urgency_hits: (v) => (v ? `${v} urgency phrase${v === 1 ? '' : 's'}` : 'no urgency language'),
  incident_match_count: (v) => `${v} matching past incident${v === 1 ? '' : 's'}`,
};
