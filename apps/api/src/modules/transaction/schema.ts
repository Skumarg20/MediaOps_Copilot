import { z } from 'zod';

export const listTransactionsSchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(25)
});

export const rewardSeriesSchema = z.object({
	limit: z.coerce.number().int().min(1).max(1000).default(200)
});
