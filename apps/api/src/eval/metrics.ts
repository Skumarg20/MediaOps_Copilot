import type { GoldenCase } from './goldenSet.js';
import type { CaseOutcome } from './harness.js';
import type { Strategy } from './strategies.js';

export interface StrategyMetrics {
	name: string;
	label: string;
	description: string;
	cases: number;
	routingAccuracy: number | null;
	routingLabelled: number;
	answered: number;
	abstained: number;
	correctAnswers: number;
	missedAnswers: number;
	falseAnswers: number;
	falseAnswerRate: number | null;
	abstentionPrecision: number | null;
	abstentionRecall: number | null;
	abstentionF1: number | null;
	citationValidity: number | null;
	citedExpectedRate: number | null;
	fellBack: number;
}

function ratio(numerator: number, denominator: number): number | null {
	return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

export function computeMetrics(
	cases: GoldenCase[],
	outcomes: CaseOutcome[],
	strategy: Strategy
): StrategyMetrics {
	const byId = new Map(outcomes.map((outcome) => [outcome.caseId, outcome]));

	let routingHits = 0;
	let routingLabelled = 0;
	let answered = 0;
	let correctAnswers = 0;
	let missedAnswers = 0;
	let falseAnswers = 0;
	let shouldAbstain = 0;
	let citableAnswers = 0;
	let cleanCitations = 0;
	let mustCiteCases = 0;
	let mustCiteHits = 0;
	let fellBack = 0;

	for (const testCase of cases) {
		const outcome = byId.get(testCase.id);
		if (!outcome) continue;

		if (testCase.expectedPath !== 'any') {
			routingLabelled += 1;
			if (outcome.pathUsed === testCase.expectedPath) routingHits += 1;
		}

		if (outcome.fellBack) fellBack += 1;
		if (!testCase.shouldAnswer) shouldAbstain += 1;

		if (outcome.answered) {
			answered += 1;
			citableAnswers += 1;
			if (outcome.invalidCitations.length === 0 && outcome.citations.length > 0) cleanCitations += 1;
			if (testCase.shouldAnswer) correctAnswers += 1;
			else falseAnswers += 1;
		} else if (testCase.shouldAnswer) {
			missedAnswers += 1;
		}

		if (testCase.mustCite) {
			mustCiteCases += 1;
			if (outcome.citedExpected) mustCiteHits += 1;
		}
	}

	const truePositives = shouldAbstain - falseAnswers;
	const abstained = cases.length - answered;
	const precision = ratio(truePositives, abstained);
	const recall = ratio(truePositives, shouldAbstain);
	const f1 =
		precision === null || recall === null || precision + recall === 0
			? null
			: Number(((2 * precision * recall) / (precision + recall)).toFixed(4));

	return {
		name: strategy.name,
		label: strategy.label,
		description: strategy.description,
		cases: cases.length,
		routingAccuracy: ratio(routingHits, routingLabelled),
		routingLabelled,
		answered,
		abstained,
		correctAnswers,
		missedAnswers,
		falseAnswers,
		falseAnswerRate: ratio(falseAnswers, shouldAbstain),
		abstentionPrecision: precision,
		abstentionRecall: recall,
		abstentionF1: f1,
		citationValidity: ratio(cleanCitations, citableAnswers),
		citedExpectedRate: ratio(mustCiteHits, mustCiteCases),
		fellBack
	};
}

export function percent(value: number | null): string {
	return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}
