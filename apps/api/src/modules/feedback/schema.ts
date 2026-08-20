import { z } from 'zod';

/**
 * The assignment fixes this contract: a binary score where `1 = helpful` and
 * `0 = unhelpful`. That is the canonical wire value and what the reward formula
 * consumes directly — `Reward = (score × 10) − latency_s − hallucination_penalty`.
 *
 * `-1` is accepted as an alias for `0`. Earlier clients (and the first version of
 * this console) sent ±1, and silently 400-ing them would turn a rating an
 * operator believed they had given into a rating the policy never saw. It
 * normalises to 0 before it reaches the reward.
 */
export const FEEDBACK_SCORE_HELPFUL = 1;
export const FEEDBACK_SCORE_UNHELPFUL = 0;

export const feedbackScoreSchema = z
	.union([z.literal(1), z.literal(0), z.literal(-1)])
	.transform((score) => (score === -1 ? FEEDBACK_SCORE_UNHELPFUL : score));

export const feedbackSchema = z.object({
	transactionId: z.string().trim().min(1, 'transactionId is required'),
	score: feedbackScoreSchema
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

/** Binary score as stored and as fed to the reward function. */
export type FeedbackScore = 0 | 1;
