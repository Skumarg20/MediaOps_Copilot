import { Hono } from 'hono';
import { operatorProcedure, router } from '@/trpc.js';
import { getContext } from '@/context.js';
import { rewardSeriesSchema } from '@/modules/transaction/schema.js';
import { transactionService } from '@/modules/transaction/index.js';
import { parseActionKey } from './services/state.js';
import { TRIAGE_CLASSES } from './services/state.js';

/**
 * Powers the console's RL panel: per-arm pulls and mean reward, plus the reward
 * time series that makes "it improved over the session" something you can see
 * rather than something the README claims.
 */
async function buildStats({ limit }: { limit: number }) {
	const snapshot = await getContext().bandit.snapshot();
	const totalPulls = snapshot.reduce((sum, arm) => sum + arm.pulls, 0);

	const arms = snapshot.map((arm) => {
		const action = parseActionKey(arm.action);
		return {
			state: arm.state,
			action: arm.action,
			path: action.path,
			model: action.model,
			pulls: arm.pulls,
			mean_reward: Number(arm.meanReward.toFixed(4)),
			pull_share: totalPulls === 0 ? 0 : Number((arm.pulls / totalPulls).toFixed(4)),
			last_updated: arm.lastUpdated
		};
	});

	return {
		states: TRIAGE_CLASSES,
		arms,
		total_pulls: totalPulls,
		series: await transactionService.getRewardSeries({ limit })
	};
}

export const rlRoutes = new Hono();

rlRoutes.get('/stats', async (c) => {
	const parsed = rewardSeriesSchema.safeParse({ limit: c.req.query('limit') ?? undefined });
	if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
	return c.json(await buildStats({ limit: parsed.data.limit }), 200);
});

export const rlRouter = router({
	stats: operatorProcedure.input(rewardSeriesSchema).query(async ({ input }) => {
		return buildStats({ limit: input.limit });
	})
});
