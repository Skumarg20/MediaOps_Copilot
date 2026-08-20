import { randomUUID } from 'node:crypto';
import { config } from '@/config.js';
import { getContext } from '@/context.js';
import { agentService } from '@/modules/agent/index.js';
import { ABSTENTION_ANSWER, groundingService } from '@/modules/grounding/index.js';
import { explainService } from '@/modules/explain/index.js';
import { platformService } from '@/modules/platform/index.js';
import { rlService } from '@/modules/rl/index.js';
import { routingService, type PinDecision } from '@/modules/routing/index.js';
import { insertTransaction } from '@/modules/transaction/index.js';
import { childLogger, logEvent, requestDuration, retrievalHits } from '@/utils/index.js';
import type { Evidence, GroundingVerdict, ModelArm, QueryContext, QueryResponse, Retriever } from '@/types.js';

export class NoPathAvailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NoPathAvailableError';
	}
}

/**
 * The answer path, in the order the design lays it out:
 *   triage → route → retrieve → reason → verify → explain → learn (provisional)
 *
 * Every stage records its decision rather than only its outcome, which is what
 * the RL loop and the rationale panel are both built from.
 */
export async function handleQuery({ query }: { query: string }): Promise<QueryResponse> {
	const ctx = getContext();
	const transactionId = randomUUID();
	const log = childLogger(transactionId);
	const started = Date.now();

	// ---------------------------------------------------------------- 1. triage
	const anchors = await routingService.extractAnchors({ query });
	const incidentMatchCount = await platformService.countIncidentMatches({ query });
	const triage = ctx.classifier.predict(query, { anchors, incidentMatchCount });

	logEvent(log, 'info', 'triage.classified', {
		class: triage.class,
		confidence: triage.confidence,
		top_features: triage.topFeatures.map((feature) => feature.name)
	});

	// ----------------------------------------------------------------- 2. route
	const vectorHealth = await ctx.vector.health();
	const vectorAvailable = vectorHealth.status === 'up';

	const pin = routingService.decidePin({
		anchors,
		vectorAvailable,
		forceVectorless: config.retrieval.forceVectorless
	});
	logEvent(log, 'info', 'router.decided', {
		path: pin.path ?? 'bandit',
		reason: pin.code,
		deterministic: pin.deterministic
	});

	// A model tag that is missing cannot be selected; the arm is masked out, not
	// penalised — an unavailable arm is not a bad arm.
	const tags = await ctx.llm.availableModels();
	const healthyModels = config.models.filter((model: ModelArm) => tags.has(model));
	const availableModels = healthyModels.length > 0 ? healthyModels : [...config.models];

	const allowed = rlService.maskActions({ pinnedPath: pin.path, availableModels });
	if (allowed.length === 0) {
		throw new NoPathAvailableError('no retrieval path and model combination is available');
	}
	if (pin.path || healthyModels.length < config.models.length) {
		logEvent(log, 'info', 'bandit.masked', {
			pinned_path: pin.path,
			allowed: allowed.map(rlService.actionKey),
			unavailable_models: config.models.filter((model: ModelArm) => !availableModels.includes(model))
		});
	}

	const decision = await ctx.bandit.select(triage.class, allowed);
	logEvent(log, 'info', 'bandit.selected', {
		state: triage.class,
		action: rlService.actionKey(decision.action),
		exploring: decision.exploring,
		epsilon: decision.epsilon,
		arm_mean: decision.armStats.meanReward
	});

	const path = decision.action.path;
	const model = decision.action.model;

	// -------------------------------------------------------------- 3. retrieve
	const queryContext: QueryContext = { transactionId, triage, anchors };
	const retriever: Retriever = path === 'vector' ? ctx.vector : ctx.vectorless;

	const retrieveStart = Date.now();
	let evidence: Evidence[] = await retriever.retrieve(query, queryContext);
	let usedPath = path;
	let fellBack = false;

	// Chosen path came back empty but the deterministic one might not have. Trying
	// it costs a few milliseconds and moves *down* the degradation ladder, toward
	// the more verifiable answer — never up.
	if (evidence.length === 0 && path === 'vector') {
		const fallback = await ctx.vectorless.retrieve(query, queryContext);
		if (fallback.length > 0) {
			evidence = fallback;
			usedPath = 'vectorless';
			fellBack = true;
			logEvent(log, 'info', 'retrieval.completed', {
				path: 'vectorless',
				mode: 'fallback_after_vector_floor_miss',
				hits: evidence.length
			});
		}
	}

	logEvent(log, 'info', 'retrieval.completed', {
		path: usedPath,
		hits: evidence.length,
		top_score: evidence[0]?.score ?? null,
		ms: Date.now() - retrieveStart
	});
	if (evidence.length === 0) retrievalHits.observe({ path: usedPath }, 0);

	// ---------------------------------------------------- 4. reason  5. verify
	let answer: string;
	let citedIds: string[];
	let degraded = false;
	let degradedReason: string | undefined;
	let verdict: GroundingVerdict;

	if (evidence.length === 0) {
		// Gate 1 tripped. No model is invoked at all — the cheapest possible
		// hallucination defence is not generating in the first place.
		answer = ABSTENTION_ANSWER;
		citedIds = [];
		verdict = {
			...ctx.grounder.score(answer, [], []),
			reason: 'Nothing passed the retrieval floor, so no answer could be grounded.'
		};
		logEvent(log, 'warn', 'grounding.failed', {
			overlap: 0,
			invalid_citations: 0,
			decision: 'abstain',
			reason: 'retrieval_floor'
		});
	} else {
		const agent = await agentService.runReactLoop(query, evidence, {
			llm: ctx.llm,
			log,
			transactionId,
			model
		});

		evidence = agent.evidence;
		degraded = agent.degraded;
		degradedReason = agent.degradedReason;

		verdict = ctx.grounder.score(agent.answer, agent.citedIds, agent.evidence);

		if (verdict.grounded) {
			answer = agent.answer;
			citedIds = verdict.validCitations;
			logEvent(log, 'info', 'grounding.passed', {
				band: verdict.band,
				overlap: verdict.overlap,
				citations: citedIds.length
			});
		} else {
			// Abstention is a first-class outcome, not an error: it returns 200, flows
			// through the same rating path, and still costs the arm its penalty.
			answer = ABSTENTION_ANSWER;
			citedIds = [];
			logEvent(log, 'warn', 'grounding.failed', {
				overlap: verdict.overlap,
				invalid_citations: verdict.invalidCitations.length,
				decision: 'abstain',
				reason: verdict.reason
			});
		}
	}

	const latencyMs = Date.now() - started;
	const hallucinationPenalty = rlService.hallucinationPenaltyFor(verdict.grounded, verdict.invalidCitations.length);

	// --------------------------------------------------------------- 6. explain
	const citations = explainService.toCitations(evidence, citedIds);
	const effectivePin: PinDecision = fellBack
		? {
				...pin,
				path: usedPath,
				deterministic: true,
				reason: `${pin.reason} The vector path returned nothing above its similarity floor, so the answer fell back to the deterministic path.`,
				code: 'vector_unavailable'
			}
		: pin;

	const rationale = explainService.composeRationale({
		path: usedPath,
		pin: effectivePin,
		decision,
		triage,
		verdict,
		evidence,
		citedIds,
		...(degradedReason ? { degradedReason } : {})
	});

	// ------------------------------------------- 7. learn (provisional phase)
	const armAfterPull = await ctx.bandit.registerPull(triage.class, decision.action);
	rlService.recordPullMetric(triage.class, rlService.actionKey(decision.action), decision.exploring);
	rationale.model.arm_pulls = armAfterPull.pulls;

	await insertTransaction({
		id: transactionId,
		query,
		answer,
		path: usedPath,
		model,
		triageClass: triage.class,
		latencyMs,
		grounded: verdict.grounded,
		overlapScore: verdict.overlap,
		confidenceBand: verdict.band,
		hallucinationPenalty,
		exploring: decision.exploring,
		degraded,
		rationale,
		citations
	});

	requestDuration.observe({ route: '/query', path: usedPath, model }, latencyMs / 1000);

	return {
		transaction_id: transactionId,
		answer,
		retrieval_path: usedPath,
		llm_used: model,
		latency_ms: latencyMs,
		grounded: verdict.grounded,
		hallucination_risk: groundingService.riskFromVerdict(verdict),
		citations,
		rationale,
		degraded
	};
}
