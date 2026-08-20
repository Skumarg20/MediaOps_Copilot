import { z } from 'zod';

export const querySchema = z.object({
	query: z
		.string()
		.trim()
		.min(1, 'query must not be empty')
		.max(2000, 'query must be 2000 characters or fewer')
});

export type QueryInput = z.infer<typeof querySchema>;
