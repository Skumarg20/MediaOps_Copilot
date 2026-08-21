import { Hono } from 'hono';
import { operatorProcedure, router } from '@/trpc.js';
import { listTransactionsSchema } from './schema.js';
import { transactionService } from './services/index.js';

export const transactionRoutes = new Hono();

transactionRoutes.get('/', async (c) => {
	const parsed = listTransactionsSchema.safeParse({ limit: c.req.query('limit') ?? undefined });
	if (!parsed.success) {
		return c.json(
			{
				error: 'invalid_request',
				details: parsed.error.issues.map((issue) => ({
					field: issue.path.join('.') || 'limit',
					message: issue.message
				}))
			},
			400
		);
	}

	const transactions = await transactionService.listTransactions({ limit: parsed.data.limit });
	return c.json({ transactions, count: transactions.length }, 200);
});

export const transactionRouter = router({
	list: operatorProcedure.input(listTransactionsSchema).query(async ({ input }) => {
		const transactions = await transactionService.listTransactions({ limit: input.limit });
		return { transactions, count: transactions.length };
	})
});
