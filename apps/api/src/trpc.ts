import { TRPCError, initTRPC } from '@trpc/server';
import { logger } from '@/utils/index.js';

export interface Context {
	distinctId?: string;
	operatorKey?: string;
}

const t = initTRPC.context<Context>().create({
	errorFormatter({ shape, error }) {
		logger.error({ event: 'http.request', error, shape }, 'trpc error');
		return shape;
	}
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const operatorProcedure = t.procedure.use(async ({ ctx, next }) => {
	const expected = process.env.OPERATOR_KEY;
	if (!expected) return next({ ctx });

	if (ctx.operatorKey !== expected) {
		throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Operator key is required' });
	}

	return next({ ctx });
});
