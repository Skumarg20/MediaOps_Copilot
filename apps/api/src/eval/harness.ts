import { getContext } from '@/context.js';
import { agentService } from '@/modules/agent/index.js';
import { routingService } from '@/modules/routing/index.js';
import { childLogger } from '@/utils/index.js';
import type { Generator } from '@/connections/index.js';
import type { Evidence, ModelArm, QueryContext, RetrievalPath } from '@/types.js';
import type { GoldenCase } from './goldenSet.js';
import { mulberry32, type ModelBehaviour, type Strategy } from './strategies.js';

export type LlmResolver = (behaviour: ModelBehaviour) => Generator;

const EVAL_MODEL: ModelArm = 'llama3.2:3b';

export interface CaseOutcome {
	caseId: string;
	strategy: string;
	pinnedPath: RetrievalPath | null;
	pathChosen: RetrievalPath;
	pathUsed: RetrievalPath;
	fellBack: boolean;
	evidenceCount: number;
	answered: boolean;
	grounded: boolean;
	overlap: number;
	citations: string[];
	invalidCitations: string[];
	citedExpected: boolean | null;
}

async function retrieveOn(
	path: RetrievalPath,
	query: string,
	queryContext: QueryContext
): Promise<Evidence[]> {
	const ctx = getContext();
	const retriever = path === 'vector' ? ctx.vector : path === 'hybrid' ? ctx.hybrid : ctx.vectorless;
	return retriever.retrieve(query, queryContext);
}

export async function runCase(
	testCase: GoldenCase,
	strategy: Strategy,
	seed: number,
	llmFor: LlmResolver
): Promise<CaseOutcome> {
	const ctx = getContext();
	const rng = mulberry32(seed);
	const log = childLogger(`eval-${testCase.id}`);

	const anchors = await routingService.extractAnchors({ query: testCase.query });
	const incidentMatchCount = 0;
	const triage = ctx.classifier.predict(testCase.query, { anchors, incidentMatchCount });

	const vectorHealth = await ctx.vector.health();
	const pin = routingService.decidePin({
		anchors,
		query: testCase.query,
		vectorAvailable: vectorHealth.status === 'up',
		forceVectorless: false
	});

	const pathChosen = strategy.choosePath(pin, rng);
	const queryContext: QueryContext = { transactionId: `eval-${testCase.id}`, triage, anchors };

	let evidence = await retrieveOn(pathChosen, testCase.query, queryContext);
	let pathUsed = pathChosen;
	let fellBack = false;

	if (evidence.length === 0 && strategy.fallback) {
		const alternatePath: RetrievalPath = pathChosen === 'vector' ? 'vectorless' : 'vector';
		const fallbackEvidence = await retrieveOn(alternatePath, testCase.query, queryContext);
		if (fallbackEvidence.length > 0) {
			evidence = fallbackEvidence;
			pathUsed = alternatePath;
			fellBack = true;
		}
	}

	const base = {
		caseId: testCase.id,
		strategy: strategy.name,
		pinnedPath: pin.path,
		pathChosen,
		pathUsed,
		fellBack
	};

	if (evidence.length === 0) {
		return {
			...base,
			evidenceCount: 0,
			answered: false,
			grounded: false,
			overlap: 0,
			citations: [],
			invalidCitations: [],
			citedExpected: testCase.mustCite ? false : null
		};
	}

	const agent = await agentService.runReactLoop(testCase.query, evidence, {
		llm: llmFor(strategy.behaviour),
		log,
		transactionId: queryContext.transactionId,
		model: EVAL_MODEL
	});

	const verdict = ctx.grounder.score(agent.answer, agent.citedIds, agent.evidence);
	const answered = strategy.gate ? verdict.grounded : agent.answer.trim().length > 0;
	const citations = strategy.gate ? verdict.validCitations : agent.citedIds;

	return {
		...base,
		evidenceCount: agent.evidence.length,
		answered,
		grounded: verdict.grounded,
		overlap: Number(verdict.overlap.toFixed(4)),
		citations,
		invalidCitations: verdict.invalidCitations,
		citedExpected: testCase.mustCite
			? answered && testCase.mustCite.every((id) => citations.includes(id))
			: null
	};
}

export async function runStrategy(
	cases: GoldenCase[],
	strategy: Strategy,
	seed: number,
	llmFor: LlmResolver
): Promise<CaseOutcome[]> {
	const outcomes: CaseOutcome[] = [];
	for (const [index, testCase] of cases.entries()) {
		outcomes.push(await runCase(testCase, strategy, seed + index, llmFor));
	}
	return outcomes;
}
