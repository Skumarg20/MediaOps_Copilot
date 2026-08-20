import { Hono } from 'hono';
import { z } from 'zod';
import { publicProcedure, router } from '@/trpc.js';
import { feedbackScoreSchema, feedbackSchema } from './schema.js';
import { feedbackService } from './services/index.js';

/**
 * The wire contract uses `transaction_id` (snake_case) because the interface
 * spec pins that spelling; the service layer speaks camelCase like the rest of
 * the codebase. The translation happens here, at the boundary, and nowhere else.
 */
const feedbackBodySchema = z.object({
	transaction_id: z.string().trim().min(1, 'transaction_id is required'),
	score: feedbackScoreSchema
});

export const feedbackRoutes = new Hono();

feedbackRoutes.post('/', async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = feedbackBodySchema.safeParse(body);

	if (!parsed.success) {
		return c.json(
			{
				error: 'invalid_request',
				details: parsed.error.issues.map((issue) => ({
					field: issue.path.join('.') || '(body)',
					message: issue.message
				}))
			},
			400
		);
	}

	const result = await feedbackService.recordFeedback({
		transactionId: parsed.data.transaction_id,
		score: parsed.data.score
	});

	return c.json(result, 200);
});

/**
 * REST is the pinned contract — `POST /feedback` must work with plain curl. The
 * tRPC procedure wraps the same service function, so the console can have typed
 * access without a second implementation to drift out of sync.
 */
export const feedbackRouter = router({
	rate: publicProcedure.input(feedbackSchema).mutation(async ({ input }) => {
		return feedbackService.recordFeedback(input);
	})
});
