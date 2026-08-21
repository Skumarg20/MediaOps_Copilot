import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { publicProcedure, router } from '@/trpc.js';
import { querySchema } from './schema.js';
import { NoPathAvailableError, queryService } from './services/index.js';

export const queryRoutes = new Hono();

queryRoutes.post('/', async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = querySchema.safeParse(body);

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

	try {
		return c.json(await queryService.handleQuery({ query: parsed.data.query }), 200);
	} catch (error) {
		if (error instanceof NoPathAvailableError) {
			throw new HTTPException(503, { message: error.message });
		}
		throw error;
	}
});

export const queryRouter = router({
	ask: publicProcedure.input(querySchema).mutation(async ({ input }) => {
		return queryService.handleQuery({ query: input.query });
	})
});
