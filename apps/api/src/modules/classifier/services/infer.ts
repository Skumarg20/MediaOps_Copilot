import { createRequire } from 'node:module';
import type {
  Classifier,
  FeatureContribution,
  QueryMeta,
  Triage,
  TriageClass,
} from '@/types.js';
import {
  FEATURE_LABELS,
  FEATURE_NAMES,
  type FeatureName,
  extractFeatures,
} from './features.js';

const require = createRequire(import.meta.url);

export type TriageModel = {
  trained_by: string;
  trained_at: string;
  labels: TriageClass[];
  feature_names: string[];
  coefficients: number[][];
  intercepts: number[];
  means: number[];
  stds: number[];
};

const model = require('../model.json') as TriageModel;

function assertModelShape(m: TriageModel): void {
  const f = m.feature_names.length;
  const c = m.labels.length;
  const ok =
    f === FEATURE_NAMES.length &&
    m.feature_names.every((n, i) => n === FEATURE_NAMES[i]) &&
    m.coefficients.length === c &&
    m.coefficients.every((row) => row.length === f) &&
    m.intercepts.length === c &&
    m.means.length === f &&
    m.stds.length === f;
  if (!ok) {
    throw new Error(
      'triage model.json does not match the compiled feature contract — retrain via `npm run ml:train`',
    );
  }
}

assertModelShape(model);

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export class LogisticTriageClassifier implements Classifier {
  constructor(private readonly m: TriageModel = model) {}

  predict(query: string, meta: QueryMeta): Triage {
    const raw = extractFeatures(query, {
      anchors: meta.anchors,
      incidentMatchCount: meta.incidentMatchCount ?? 0,
    });

    const z = raw.map((v, i) => {
      const std = this.m.stds[i] ?? 1;
      return (v - (this.m.means[i] ?? 0)) / (std === 0 ? 1 : std);
    });

    const logits = this.m.coefficients.map((row, c) => {
      let sum = this.m.intercepts[c] ?? 0;
      for (let i = 0; i < row.length; i += 1) sum += (row[i] ?? 0) * (z[i] ?? 0);
      return sum;
    });

    const probs = softmax(logits);
    let best = 0;
    for (let i = 1; i < probs.length; i += 1) {
      if ((probs[i] ?? 0) > (probs[best] ?? 0)) best = i;
    }

    const label = this.m.labels[best] ?? 'complex_diagnostic';
    const winningRow = this.m.coefficients[best] ?? [];

    const contributions: FeatureContribution[] = FEATURE_NAMES.map((name, i) => ({
      name,
      value: raw[i] ?? 0,
      contribution: (winningRow[i] ?? 0) * (z[i] ?? 0),
    }));

    const topFeatures = [...contributions]
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 2);

    const scores = {} as Record<TriageClass, number>;
    this.m.labels.forEach((lab, i) => {
      scores[lab] = Number((probs[i] ?? 0).toFixed(4));
    });

    return {
      class: label,
      confidence: Number((probs[best] ?? 0).toFixed(4)),
      topFeatures,
      scores,
    };
  }
}

export function explainFeatures(features: FeatureContribution[]): string {
  if (features.length === 0) return 'No feature contributed materially.';
  const parts = features.map((f) => {
    const label = FEATURE_LABELS[f.name as FeatureName]?.(f.value) ?? `${f.name}=${f.value}`;
    const sign = f.contribution >= 0 ? '+' : '−';
    return `${label} (${sign}${Math.abs(f.contribution).toFixed(1)})`;
  });
  return `Flagged by: ${parts.join(', ')}.`;
}

export const triageClassifier = new LogisticTriageClassifier();
