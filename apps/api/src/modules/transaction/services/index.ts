import {
	getRewardSeries,
	getTransaction,
	hasFeedback,
	insertFeedback,
	insertTransaction,
	listTransactions
} from './store.js';

export const transactionService = {
	insertTransaction,
	listTransactions,
	getTransaction,
	insertFeedback,
	hasFeedback,
	getRewardSeries
};

export { insertTransaction, listTransactions, getTransaction, insertFeedback, hasFeedback, getRewardSeries };
export type { FeedbackWrite, NewTransaction, RewardPoint } from './store.js';
