import { config } from '@/config.js';

export type RewardInputs = {
  feedback: number;
  latencyMs: number;
  hallucinationPenalty: number;
};

export function computeReward(inputs: RewardInputs): number {
  const latencySeconds = inputs.latencyMs / 1000;
  const raw =
    config.rl.feedbackWeight * inputs.feedback - latencySeconds - inputs.hallucinationPenalty;
  return Number(raw.toFixed(4));
}

export function hallucinationPenaltyFor(grounded: boolean, invalidCitations: number): number {
  if (!grounded || invalidCitations > 0) return config.rl.hallucinationPenalty;
  return 0;
}
