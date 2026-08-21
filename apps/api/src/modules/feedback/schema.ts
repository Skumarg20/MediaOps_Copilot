import { z } from 'zod';

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

export type FeedbackScore = 0 | 1;
