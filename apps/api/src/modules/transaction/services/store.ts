import type { Knex } from 'knex';
import { db } from '@/connections/index.js';
import type {
	ActionKey,
	Citation,
	ConfidenceBand,
	ModelArm,
	Rationale,
	RetrievalPath,
	TransactionRecord,
	TriageClass
} from '@/types.js';

export interface NewTransaction {
	id: string;
	query: string;
	answer: string;
	path: RetrievalPath;
	model: ModelArm;
	triageClass: TriageClass;
	latencyMs: number;
	grounded: boolean;
	overlapScore: number;
	confidenceBand: ConfidenceBand;
	hallucinationPenalty: number;
	exploring: boolean;
	degraded: boolean;
	rationale: Rationale;
	citations: Citation[];
}

interface TransactionRow {
	id: string;
	query: string;
	answer: string;
	path: string;
	model: string;
	triageClass: string;
	latencyMs: number;
	grounded: boolean;
	overlapScore: number;
	confidenceBand: string;
	hallucinationPenalty: number;
	exploring: boolean;
	degraded: boolean;
	rationale: Rationale;
	createdAt: Date;
	feedbackScore: number | null;
	feedbackReward: number | null;
	feedbackCreatedAt: Date | null;
}

interface CitationRow {
	transactionId: string;
	evidenceId: string;
	source: string;
	score: number | null;
	excerpt: string;
}

const iso = (value: Date | string | null): string =>
	value === null ? '' : value instanceof Date ? value.toISOString() : String(value);

export async function insertTransaction(tx: NewTransaction, trx: Knex = db): Promise<string> {
	const createdAt = new Date();

	await trx.transaction(async (t) => {
		await t('copilot.transaction').insert({
			id: tx.id,
			query: tx.query,
			answer: tx.answer,
			path: tx.path,
			model: tx.model,
			triageClass: tx.triageClass,
			latencyMs: tx.latencyMs,
			grounded: tx.grounded,
			overlapScore: tx.overlapScore,
			confidenceBand: tx.confidenceBand,
			hallucinationPenalty: tx.hallucinationPenalty,
			exploring: tx.exploring,
			degraded: tx.degraded,
			rationale: JSON.stringify(tx.rationale),
			createdAt
		});

		if (tx.citations.length > 0) {
			await t('copilot.citation')
				.insert(
					tx.citations.map((citation) => ({
						transactionId: tx.id,
						evidenceId: citation.id,
						source: citation.source,
						score: citation.score ?? null,
						excerpt: citation.excerpt
					}))
				)
				.onConflict(['transaction_id', 'evidence_id'])
				.ignore();
		}
	});

	return createdAt.toISOString();
}

function baseQuery(trx: Knex) {
	return trx('copilot.transaction as t')
		.leftJoin('copilot.feedback as f', 'f.transaction_id', 't.id')
		.select(
			't.*',
			'f.score as feedback_score',
			'f.reward as feedback_reward',
			'f.created_at as feedback_created_at'
		);
}

async function hydrate(rows: TransactionRow[], trx: Knex): Promise<TransactionRecord[]> {
	if (rows.length === 0) return [];

	const citationRows = (await trx('copilot.citation')
		.whereIn(
			'transactionId',
			rows.map((row) => row.id)
		)
		.select('*')) as CitationRow[];

	const byTransaction = new Map<string, Citation[]>();
	for (const row of citationRows) {
		const list = byTransaction.get(row.transactionId) ?? [];
		list.push({
			id: row.evidenceId,
			source: row.source as Citation['source'],
			excerpt: row.excerpt,
			...(row.score === null ? {} : { score: row.score })
		});
		byTransaction.set(row.transactionId, list);
	}

	return rows.map((row) => ({
		id: row.id,
		query: row.query,
		answer: row.answer,
		path: row.path as RetrievalPath,
		model: row.model as ModelArm,
		triage_class: row.triageClass as TriageClass,
		latency_ms: row.latencyMs,
		grounded: row.grounded,
		overlap_score: row.overlapScore,
		confidence_band: row.confidenceBand as ConfidenceBand,
		hallucination_penalty: row.hallucinationPenalty,
		exploring: row.exploring,
		degraded: row.degraded,
		rationale: typeof row.rationale === 'string' ? (JSON.parse(row.rationale) as Rationale) : row.rationale,
		citations: byTransaction.get(row.id) ?? [],
		created_at: iso(row.createdAt),
		feedback:
			row.feedbackScore === null
				? null
				: {
						score: row.feedbackScore,
						reward: row.feedbackReward ?? 0,
						created_at: iso(row.feedbackCreatedAt)
					}
	}));
}

export async function listTransactions({ limit }: { limit: number }, trx: Knex = db): Promise<TransactionRecord[]> {
	const rows = (await baseQuery(trx).orderBy('t.created_at', 'desc').limit(limit)) as TransactionRow[];
	return hydrate(rows, trx);
}

export async function getTransaction({ id }: { id: string }, trx: Knex = db): Promise<TransactionRecord | null> {
	const row = (await baseQuery(trx).where('t.id', id).first()) as TransactionRow | undefined;
	if (!row) return null;
	const [record] = await hydrate([row], trx);
	return record ?? null;
}

export interface FeedbackWrite {
	transactionId: string;
	score: number;
	reward: number;
}

export async function insertFeedback(feedback: FeedbackWrite, trx: Knex = db): Promise<boolean> {
	const inserted = await trx('copilot.feedback')
		.insert({
			transactionId: feedback.transactionId,
			score: feedback.score,
			reward: feedback.reward,
			createdAt: new Date()
		})
		.onConflict('transaction_id')
		.ignore()
		.returning('transaction_id');

	return inserted.length === 1;
}

export async function hasFeedback({ transactionId }: { transactionId: string }, trx: Knex = db): Promise<boolean> {
	const row = await trx('copilot.feedback').where({ transactionId }).first();
	return Boolean(row);
}

export interface RewardPoint {
	transactionId: string;
	arm: ActionKey;
	state: TriageClass;
	reward: number;
	createdAt: string;
}

export async function getRewardSeries({ limit }: { limit: number }, trx: Knex = db): Promise<RewardPoint[]> {
	const rows = (await trx('copilot.feedback as f')
		.join('copilot.transaction as t', 't.id', 'f.transaction_id')
		.select(
			'f.transaction_id as transaction_id',
			trx.raw("t.path || '|' || t.model as arm"),
			't.triage_class as state',
			'f.reward as reward',
			'f.created_at as created_at'
		)
		.orderBy('f.created_at', 'desc')
		.limit(limit)) as Array<{
		transactionId: string;
		arm: string;
		state: string;
		reward: number;
		createdAt: Date;
	}>;

	return rows
		.reverse()
		.map((row) => ({
			transactionId: row.transactionId,
			arm: row.arm,
			state: row.state as TriageClass,
			reward: row.reward,
			createdAt: iso(row.createdAt)
		}));
}
