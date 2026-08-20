import { TRPCError, initTRPC } from '@trpc/server';
import { logger } from '@/utils/index.js';

export interface Context {
	/** Correlates every log line for one console session. */
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

/**
 * The single-operator console is unauthenticated in this build, so this
 * procedure enforces nothing today — it exists as the seam auth goes into, and
 * marks which procedures would need it. `OPERATOR_KEY` turns it on without a
 * code change; unset, it is a pass-through.
 */
export const operatorProcedure = t.procedure.use(async ({ ctx, next }) => {
	const expected = process.env.OPERATOR_KEY;
	if (!expected) return next({ ctx });

	if (ctx.operatorKey !== expected) {
		throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Operator key is required' });
	}

	return next({ ctx });
});
