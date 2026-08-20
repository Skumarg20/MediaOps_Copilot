import { config } from '@/config.js';

export type RewardInputs = {
  feedback: number;
  latencyMs: number;
  hallucinationPenalty: number;
};

/**
 * R = (feedback × 10) − latency_seconds − hallucination_penalty, feedback ∈ {0, 1}
 *
 * The 10× weight makes a helpful answer worth ~10 units against a latency cost
 * of ~1–3, so the policy optimises helpfulness *first* and uses latency only as
 * the tie-breaker between paths of equal quality. Rewards are legitimately
 * negative and nothing clamps at zero — sample-mean updates handle that
 * correctly, and clamping would erase the signal that an answer was actively bad.
 */
export function computeReward(inputs: RewardInputs): number {
  const latencySeconds = inputs.latencyMs / 1000;
  const raw =
    config.rl.feedbackWeight * inputs.feedback - latencySeconds - inputs.hallucinationPenalty;
  return Number(raw.toFixed(4));
}

/**
 * Applied at answer time, not at feedback time. An ungrounded answer is
 * therefore punished even when the operator never clicks anything, which stops
 * the policy learning to gamble on queries it expects to go unrated.
 */
export function hallucinationPenaltyFor(grounded: boolean, invalidCitations: number): number {
  if (!grounded || invalidCitations > 0) return config.rl.hallucinationPenalty;
  return 0;
}
