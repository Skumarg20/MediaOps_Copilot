import type { Knex } from 'knex';
import { db, type DbOptions } from '@/connections/index.js';
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

export async function insertTransaction(record: NewTransaction, { transaction }: DbOptions = {}): Promise<string> {
	if (!transaction) {
		return db.transaction((trx) => insertTransaction(record, { transaction: trx }));
	}

	const createdAt = new Date();

	await transaction('copilot.transaction').insert({
		id: record.id,
		query: record.query,
		answer: record.answer,
		path: record.path,
		model: record.model,
		triageClass: record.triageClass,
		latencyMs: record.latencyMs,
		grounded: record.grounded,
		overlapScore: record.overlapScore,
		confidenceBand: record.confidenceBand,
		hallucinationPenalty: record.hallucinationPenalty,
		exploring: record.exploring,
		degraded: record.degraded,
		rationale: JSON.stringify(record.rationale),
		createdAt
	});

	if (record.citations.length > 0) {
		await transaction('copilot.citation')
			.insert(
				record.citations.map((citation) => ({
					transactionId: record.id,
					evidenceId: citation.id,
					source: citation.source,
					score: citation.score ?? null,
					excerpt: citation.excerpt
				}))
			)
			.onConflict(['transactionId', 'evidenceId'])
			.ignore();
	}

	return createdAt.toISOString();
}

function baseQuery(transaction: Knex) {
	return transaction('copilot.transaction as t')
		.leftJoin('copilot.feedback as f', 'f.transactionId', 't.id')
		.select(
			't.*',
			'f.score as feedbackScore',
			'f.reward as feedbackReward',
			'f.createdAt as feedbackCreatedAt'
		);
}

async function hydrate(rows: TransactionRow[], transaction: Knex): Promise<TransactionRecord[]> {
	if (rows.length === 0) return [];

	const citationRows = (await transaction('copilot.citation')
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

export async function listTransactions(
	{ limit }: { limit: number },
	{ transaction = db }: DbOptions = {}
): Promise<TransactionRecord[]> {
	const rows = (await baseQuery(transaction).orderBy('t.createdAt', 'desc').limit(limit)) as TransactionRow[];
	return hydrate(rows, transaction);
}

export async function getTransaction(
	{ id }: { id: string },
	{ transaction = db }: DbOptions = {}
): Promise<TransactionRecord | null> {
	const row = (await baseQuery(transaction).where('t.id', id).first()) as TransactionRow | undefined;
	if (!row) return null;
	const [record] = await hydrate([row], transaction);
	return record ?? null;
}

export interface FeedbackWrite {
	transactionId: string;
	score: number;
	reward: number;
}

export async function insertFeedback(
	feedback: FeedbackWrite,
	{ transaction = db }: DbOptions = {}
): Promise<boolean> {
	const inserted = await transaction('copilot.feedback')
		.insert({
			transactionId: feedback.transactionId,
			score: feedback.score,
			reward: feedback.reward,
			createdAt: new Date()
		})
		.onConflict('transactionId')
		.ignore()
		.returning('transactionId');

	return inserted.length === 1;
}

export async function hasFeedback(
	{ transactionId }: { transactionId: string },
	{ transaction = db }: DbOptions = {}
): Promise<boolean> {
	const row = await transaction('copilot.feedback').where({ transactionId }).first();
	return Boolean(row);
}

export interface RewardPoint {
	transactionId: string;
	arm: ActionKey;
	state: TriageClass;
	reward: number;
	createdAt: string;
}

export async function getRewardSeries(
	{ limit }: { limit: number },
	{ transaction = db }: DbOptions = {}
): Promise<RewardPoint[]> {
	const rows = (await transaction('copilot.feedback as f')
		.join('copilot.transaction as t', 't.id', 'f.transactionId')
		.select(
			'f.transactionId as transactionId',
			transaction.raw("t.path || '|' || t.model as arm"),
			't.triageClass as state',
			'f.reward as reward',
			'f.createdAt as createdAt'
		)
		.orderBy('f.createdAt', 'desc')
		.limit(limit)) as Array<{
		transactionId: string;
		arm: string;
		state: string;
		reward: number;
		createdAt: Date;
	}>;

	return rows.reverse().map((row) => ({
		transactionId: row.transactionId,
		arm: row.arm,
		state: row.state as TriageClass,
		reward: row.reward,
		createdAt: iso(row.createdAt)
	}));
}
