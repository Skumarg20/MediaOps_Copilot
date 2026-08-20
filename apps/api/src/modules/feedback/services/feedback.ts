import { HTTPException } from 'hono/http-exception';
import { db } from '@/connections/index.js';
import { getContext } from '@/context.js';
import { rlService } from '@/modules/rl/index.js';
import { getTransaction, hasFeedback, insertFeedback } from '@/modules/transaction/index.js';
import { childLogger, logEvent } from '@/utils/index.js';
import type { FeedbackResponse } from '@/types.js';
import type { FeedbackScore } from '../schema.js';

/**
 * Terminal phase of the two-phase RL update. Latency and the hallucination
 * penalty were measured at answer time; the operator rating completes the
 * reward that the provisional phase deliberately left open.
 *
 * The rating and the policy update it causes commit together or not at all. A
 * rating written without its update would be lost for good: the row makes every
 * retry a 409, so the arm would never see a reward the operator believes they
 * gave it.
 */
export async function recordFeedback({
	transactionId,
	score
}: {
	transactionId: string;
	score: FeedbackScore;
}): Promise<FeedbackResponse> {
	const ctx = getContext();
	const transaction = await getTransaction({ id: transactionId });

	if (!transaction) {
		throw new HTTPException(404, { message: 'Unknown transaction' });
	}

	if (await hasFeedback({ transactionId })) {
		throw new HTTPException(409, { message: 'Feedback already recorded; the policy was not updated' });
	}

	const log = childLogger(transactionId);
	const arm = `${transaction.path}|${transaction.model}`;
	const action = rlService.parseActionKey(arm);

	const reward = rlService.computeReward({
		feedback: score,
		latencyMs: transaction.latency_ms,
		hallucinationPenalty: transaction.hallucination_penalty
	});

	const armStats = await db.transaction(async (trx) => {
		const written = await insertFeedback({ transactionId, score, reward }, trx);
		if (!written) {
			throw new HTTPException(409, { message: 'Feedback already recorded; the policy was not updated' });
		}

		return ctx.bandit.withTransaction(trx).update(transaction.triage_class, action, reward);
	});

	logEvent(log, 'info', 'rl.updated', {
		state: transaction.triage_class,
		action: arm,
		score,
		reward,
		new_mean: armStats.meanReward,
		pulls: armStats.pulls
	});

	return {
		reward,
		arm,
		arm_mean_reward: Number(armStats.meanReward.toFixed(4)),
		arm_pulls: armStats.pulls
	};
}
