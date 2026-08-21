import { randomUUID } from 'node:crypto';
import { config } from '@/config.js';
import { getContext } from '@/context.js';
import { agentService } from '@/modules/agent/index.js';
import { ABSTENTION_ANSWER, groundingService } from '@/modules/grounding/index.js';
import { explainService } from '@/modules/explain/index.js';
import { platformService } from '@/modules/platform/index.js';
import { rlService } from '@/modules/rl/index.js';
import { routingService, type PinDecision } from '@/modules/routing/index.js';
import { db } from '@/connections/index.js';
import { insertTransaction } from '@/modules/transaction/index.js';
import { annotateActiveSpan, withSpan } from '@/otel/index.js';
import { childLogger, logEvent, requestDuration, retrievalHits } from '@/utils/index.js';
import type { Evidence, GroundingVerdict, ModelArm, QueryContext, QueryResponse, RetrievalPath, Retriever } from '@/types.js';

export class NoPathAvailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NoPathAvailableError';
	}
}

export async function handleQuery({ query }: { query: string }): Promise<QueryResponse> {
	const ctx = getContext();
	const transactionId = randomUUID();
	const log = childLogger(transactionId);
	const started = Date.now();

	const { anchors, triage } = await withSpan(
		'copilot.triage',
		{ 'copilot.transaction_id': transactionId },
		async () => {
			const resolvedAnchors = await routingService.extractAnchors({ query });
			const incidentMatchCount = await platformService.countIncidentMatches({ query });
			const prediction = ctx.classifier.predict(query, { anchors: resolvedAnchors, incidentMatchCount });

			annotateActiveSpan({
				'copilot.triage_class': prediction.class,
				'copilot.triage_confidence': prediction.confidence,
				'copilot.incident_matches': incidentMatchCount
			});

			return { anchors: resolvedAnchors, triage: prediction };
		}
	);

	logEvent(log, 'info', 'triage.classified', {
		class: triage.class,
		confidence: triage.confidence,
		top_features: triage.topFeatures.map((feature) => feature.name)
	});

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

	const servableModelTags = await ctx.llm.availableModels();
	const healthyModels = config.models.filter((model: ModelArm) => servableModelTags.has(model));
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

	const queryContext: QueryContext = { transactionId, triage, anchors };
	const retriever: Retriever = path === 'vector' ? ctx.vector : ctx.vectorless;

	const retrieveStart = Date.now();
	let evidence: Evidence[] = await withSpan('copilot.retrieve', { 'copilot.retrieval_path': path }, () =>
		retriever.retrieve(query, queryContext)
	);
	let usedPath = path;
	let fellBack = false;

	if (evidence.length === 0) {
		const alternatePath: RetrievalPath = path === 'vector' ? 'vectorless' : 'vector';
		const alternateRetriever: Retriever = alternatePath === 'vector' ? ctx.vector : ctx.vectorless;

		const fallbackEvidence = await withSpan(
			'copilot.retrieve.fallback',
			{ 'copilot.retrieval_path': alternatePath },
			() => alternateRetriever.retrieve(query, queryContext)
		);

		if (fallbackEvidence.length > 0) {
			evidence = fallbackEvidence;
			usedPath = alternatePath;
			fellBack = true;
			logEvent(log, 'info', 'retrieval.completed', {
				path: alternatePath,
				mode: `fallback_after_${path}_floor_miss`,
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

	let answer: string;
	let citedIds: string[];
	let degraded = false;
	let degradedReason: string | undefined;
	let verdict: GroundingVerdict;

	if (evidence.length === 0) {
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
		const agent = await withSpan(
			'copilot.reason',
			{ 'copilot.model': model, 'copilot.evidence_count': evidence.length },
			() =>
				agentService.runReactLoop(query, evidence, {
					llm: ctx.llm,
					log,
					transactionId,
					model
				})
		);

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

	annotateActiveSpan({
		'copilot.retrieval_path': usedPath,
		'copilot.model': model,
		'copilot.exploring': decision.exploring,
		'copilot.grounded': verdict.grounded,
		'copilot.overlap': verdict.overlap,
		'copilot.confidence_band': verdict.band,
		'copilot.degraded': degraded
	});

	const latencyMs = Date.now() - started;
	const hallucinationPenalty = rlService.hallucinationPenaltyFor(verdict.grounded, verdict.invalidCitations.length);

	const citations = explainService.toCitations(evidence, citedIds);
	const effectivePin: PinDecision = fellBack
		? {
				...pin,
				path: usedPath,
				deterministic: usedPath === 'vectorless',
				reason: `${pin.reason} The ${path} path returned nothing above its floor, so the answer fell back to the ${usedPath} path.`,
				code: usedPath === 'vectorless' ? 'vector_unavailable' : pin.code
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

	await db.transaction(async (trx) => {
		const pulled = await ctx.bandit.withTransaction(trx).registerPull(triage.class, decision.action);
		rationale.model.arm_pulls = pulled.pulls;

		await insertTransaction(
			{
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
			},
			trx
		);
	});

	rlService.recordPullMetric(triage.class, rlService.actionKey(decision.action), decision.exploring);
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
