import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { publicProcedure, router } from '@/trpc.js';
import { querySchema } from './schema.js';
import { NoPathAvailableError, queryService } from './services/index.js';

/**
 * `POST /query` is a REST route rather than a tRPC procedure because the
 * interface contract pins it: it is the graded artifact and it must be callable
 * with plain curl. The tRPC procedure below wraps the same service, so the
 * console gets end-to-end types without a second implementation.
 */
export const queryRoutes = new Hono();

queryRoutes.post('/', async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = querySchema.safeParse(body);

	if (!parsed.success) {
		return c.json(
			{
				error: 'invalid_request',
				// Field-level errors so the console can render inline validation
				// rather than a generic failure.
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
			// Nothing honest can be returned, so nothing is returned. Serving a
			// guess here would violate the system's central promise.
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
