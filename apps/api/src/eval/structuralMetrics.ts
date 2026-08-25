import type { Neo4jGraph } from '@/modules/graph/index.js';
import type { ArchitectureRun } from './architectures.js';
import type { BenchQuery, IntentCategory } from './structuralQueries.js';


export type Verdict = 'correct' | 'partial' | 'fail';

export interface QueryScore {
	queryId: string;
	architecture: string;
	verdict: Verdict;
	recall: number;
	precision: number;
	f1: number;
	required: string[];
	found: string[];
	missing: string[];
	topExpected: string | null;
	topActual: string | null;
	topCorrect: boolean | null;
	returned: number;
	calls: number;
	latencyMs: number;
}

function ratio(numerator: number, denominator: number): number {
	return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

export async function scoreRun(
	query: BenchQuery,
	graph: Neo4jGraph,
	architecture: string,
	run: ArchitectureRun,
	latencyMs: number
): Promise<QueryScore> {
	const base = {
		queryId: query.id,
		architecture,
		returned: run.ids.length,
		calls: run.calls.length,
		latencyMs: Number(latencyMs.toFixed(3))
	};

	if (query.expectAbstain) {
		const clean = run.abstained || run.ids.length === 0;
		return {
			...base,
			verdict: clean ? 'correct' : 'fail',
			recall: clean ? 1 : 0,
			precision: clean ? 1 : 0,
			f1: clean ? 1 : 0,
			required: [],
			found: run.ids,
			missing: [],
			topExpected: null,
			topActual: run.top,
			topCorrect: null
		};
	}

	const required = await query.required(graph);
	const returnedSet = new Set(run.ids);
	const found = required.filter((id) => returnedSet.has(id));
	const missing = required.filter((id) => !returnedSet.has(id));

	const recall = ratio(found.length, required.length);
	const precision = ratio(found.length, run.ids.length);
	const f1 = precision + recall === 0 ? 0 : Number(((2 * precision * recall) / (precision + recall)).toFixed(4));

	const topExpected = query.topAnswer ? await query.topAnswer(graph) : null;
	const topCorrect = topExpected === null ? null : run.top === topExpected;

	const verdict: Verdict =
		recall === 1 && topCorrect !== false ? 'correct' : found.length > 0 ? 'partial' : 'fail';

	return {
		...base,
		verdict,
		recall,
		precision,
		f1,
		required,
		found,
		missing,
		topExpected,
		topActual: run.top,
		topCorrect
	};
}

export interface ArchitectureSummary {
	architecture: string;
	correct: number;
	partial: number;
	fail: number;
	meanF1: number;
	meanRecall: number;
	holdOutMeanF1: number;
	holdOutCorrect: number;
	holdOutCases: number;
	originalMeanF1: number;
	originalCorrect: number;
	originalCases: number;
	meanCalls: number;
	meanLatencyMs: number;
	byCategory: Record<string, Verdict>;
}

function mean(values: number[]): number {
	return values.length === 0 ? 0 : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
}

function worst(verdicts: Verdict[]): Verdict {
	if (verdicts.includes('fail')) return 'fail';
	if (verdicts.includes('partial')) return 'partial';
	return 'correct';
}

export function summarise(
	architecture: string,
	queries: BenchQuery[],
	scores: QueryScore[]
): ArchitectureSummary {
	const byId = new Map(queries.map((query) => [query.id, query]));
	const mine = scores.filter((score) => score.architecture === architecture && byId.has(score.queryId));

	const holdOut = mine.filter((score) => byId.get(score.queryId)?.holdOut === true);
	const original = mine.filter((score) => byId.get(score.queryId)?.holdOut === false);

	const byCategory: Record<string, Verdict> = {};
	const grouped = new Map<IntentCategory, Verdict[]>();
	for (const score of mine) {
		const category = byId.get(score.queryId)?.category;
		if (!category) continue;
		const bucket = grouped.get(category);
		if (bucket) bucket.push(score.verdict);
		else grouped.set(category, [score.verdict]);
	}
	for (const [category, verdicts] of grouped) byCategory[category] = worst(verdicts);

	return {
		architecture,
		correct: mine.filter((score) => score.verdict === 'correct').length,
		partial: mine.filter((score) => score.verdict === 'partial').length,
		fail: mine.filter((score) => score.verdict === 'fail').length,
		meanF1: mean(mine.map((score) => score.f1)),
		meanRecall: mean(mine.map((score) => score.recall)),
		holdOutMeanF1: mean(holdOut.map((score) => score.f1)),
		holdOutCorrect: holdOut.filter((score) => score.verdict === 'correct').length,
		holdOutCases: holdOut.length,
		originalMeanF1: mean(original.map((score) => score.f1)),
		originalCorrect: original.filter((score) => score.verdict === 'correct').length,
		originalCases: original.length,
		meanCalls: mean(mine.map((score) => score.calls)),
		meanLatencyMs: mean(mine.map((score) => score.latencyMs)),
		byCategory
	};
}

export const VERDICT_MARK: Record<Verdict, string> = {
	correct: 'CORRECT',
	partial: 'PARTIAL',
	fail: 'FAIL'
};
