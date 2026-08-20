import { EpsilonGreedyBandit, recordPullMetric } from './bandit.js';
import { computeReward, hallucinationPenaltyFor } from './reward.js';
import { TRIAGE_CLASSES, actionKey, allActions, maskActions, parseActionKey } from './state.js';

export const rlService = {
	computeReward,
	hallucinationPenaltyFor,
	actionKey,
	parseActionKey,
	allActions,
	maskActions,
	recordPullMetric
};

export { EpsilonGreedyBandit, TRIAGE_CLASSES };
export type { BanditOptions } from './bandit.js';
export type { RewardInputs } from './reward.js';
