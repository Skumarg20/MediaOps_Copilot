import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeLlmAdapter } from '@/connections/llmFake.js';
import { buildCommerceDataset, buildMediaOpsDataset, Neo4jGraph } from '@/modules/graph/index.js';
import { HybridRetriever, mmrSelect, reciprocalRankFusion } from '@/modules/retrieval/index.js';
import { routingService } from '@/modules/routing/index.js';
import type { QueryContext, StructuredAnchors, Triage } from '@/types.js';
import { closeGraph, isNeo4jAvailable, neo4jSkipReason } from './helpers/neo4j.js';

const TRIAGE: Triage = {
	class: 'complex_diagnostic',
	confidence: 0.5,
	topFeatures: [],
	scores: { simple_lookup: 0, complex_diagnostic: 1, urgent_incident: 0 }
};

const NO_ANCHORS: StructuredAnchors = { jobIds: [], errorCodes: [] };

function ctxWith(anchors: StructuredAnchors): QueryContext {
	return { transactionId: 'test', triage: TRIAGE, anchors };
}

const MEDIAOPS = buildMediaOpsDataset({
	jobs: [
		{ id: '482', status: 'failed', failureReason: 'RENDER_TIMEOUT', worker: 'worker-07', durationS: 1802, queuedAt: '2026-08-18T09:12:04Z', jobClass: '4k', priority: 'standard', submitter: 'pipeline-batch' },
		{ id: '483', status: 'failed', failureReason: 'RENDER_TIMEOUT', worker: 'worker-07', durationS: 1811, queuedAt: '2026-08-18T09:14:41Z', jobClass: '4k', priority: 'standard', submitter: 'pipeline-batch' },
		{ id: '485', status: 'failed', failureReason: 'FONT_MISSING', worker: 'worker-04', durationS: 8, queuedAt: '2026-08-18T10:02:55Z', jobClass: 'preview', priority: 'batch', submitter: 'studio-ui' }
	],
	errorCodes: [
		{ code: 'RENDER_TIMEOUT', meaning: 'Raised when a worker exceeds the render time budget without completing.', severity: 'high', remediation: 'Check whether other jobs on the same worker also timed out. If they did, drain the worker rather than retrying individually.' },
		{ code: 'FONT_MISSING', meaning: 'A text overlay referenced a font that is not present.', severity: 'low', remediation: 'Do not retry. Embed the font in the submission.' }
	],
	chunks: [
		{
			id: 'runbook-timeouts#c0',
			docId: 'runbook-timeouts',
			heading: 'Draining a worker',
			text: 'Draining a worker\n\nWhen a worker exceeds the render time budget repeatedly, drain it rather than retrying each job. Retrying against a sick worker consumes queue capacity and fails identically.'
		},
		{
			id: 'runbook-timeouts#c1',
			docId: 'runbook-timeouts',
			heading: 'Retry safety',
			text: 'Retry safety\n\nA single isolated timeout is safe to retry once. Repeated timeouts on one host are not.'
		}
	]
});

const hasNeo4j = await isNeo4jAvailable();

describe('rank fusion', () => {
	it('scores by rank position, never by raw score, so two scales never have to be calibrated', () => {
		const fused = reciprocalRankFusion(
			[
				{ source: 'lexical', ids: ['a', 'b', 'c'] },
				{ source: 'dense', ids: ['c', 'a', 'z'] }
			],
			60
		);

		expect(fused[0]?.id).toBe('a');
		expect(fused.find((hit) => hit.id === 'z')?.contributions).toEqual([{ source: 'dense', rank: 3 }]);
	});

	it('lets a weighted list outrank an unweighted one', () => {
		const fused = reciprocalRankFusion([
			{ source: 'exact', ids: ['anchor'], weight: 2 },
			{ source: 'lexical', ids: ['other', 'anchor'] }
		]);

		expect(fused[0]?.id).toBe('anchor');
	});

	it('records which retriever contributed each hit, and at what rank', () => {
		const fused = reciprocalRankFusion([
			{ source: 'lexical', ids: ['x'] },
			{ source: 'dense', ids: ['x'] }
		]);

		expect(fused[0]?.contributions).toEqual([
			{ source: 'lexical', rank: 1 },
			{ source: 'dense', rank: 1 }
		]);
	});
});

describe('MMR diversification', () => {
	it('prefers a different passage over a near-duplicate of one already chosen', () => {
		const selected = mmrSelect(
			[
				{ id: 'a', score: 1.0, text: 'drain the worker when it repeatedly exceeds the render budget' },
				{ id: 'a-dup', score: 0.95, text: 'drain the worker when it repeatedly exceeds the render budget' },
				{ id: 'b', score: 0.6, text: 'font substitution requires the submitter to re-encode the asset' }
			],
			{ lambda: 0.7, topK: 2 }
		);

		expect(selected.map((entry) => entry.id)).toEqual(['a', 'b']);
	});

	it('degenerates to plain relevance ordering at lambda 1', () => {
		const selected = mmrSelect(
			[
				{ id: 'a', score: 1.0, text: 'same text' },
				{ id: 'b', score: 0.9, text: 'same text' }
			],
			{ lambda: 1, topK: 2 }
		);

		expect(selected.map((entry) => entry.id)).toEqual(['a', 'b']);
	});
});

describe('structural routing', () => {
	it('pins a structural question to the fused path', () => {
		for (const query of [
			'which worker is causing the most failures',
			'which error codes have no runbook coverage',
			'is job 482 the same problem as job 487',
			'who supplies the SoC processor now'
		]) {
			const pin = routingService.decidePin({ anchors: NO_ANCHORS, query, vectorAvailable: true, forceVectorless: false });
			expect(pin.path).toBe('hybrid');
			expect(pin.code).toBe('structural_query');
		}
	});

	it('sends an anchored question that asks what to do to the fused path', () => {
		const pin = routingService.decidePin({
			anchors: { jobIds: ['482'], errorCodes: [] },
			query: 'how do I fix job 482',
			vectorAvailable: true,
			forceVectorless: false
		});

		expect(pin.path).toBe('hybrid');
		expect(pin.code).toBe('anchor_plus_procedural');
	});

	it('leaves a plain record lookup on the deterministic path', () => {
		const pin = routingService.decidePin({
			anchors: { jobIds: ['482'], errorCodes: [] },
			query: 'why did job 482 fail',
			vectorAvailable: true,
			forceVectorless: false
		});

		expect(pin.path).toBe('vectorless');
		expect(pin.code).toBe('job_id_exact_match');
	});

	it('does not read an out-of-domain question as structural', () => {
		for (const query of [
			'what is the capital of France',
			'how do I bake sourdough bread',
			'write me a poem about rendering',
			'why would frames finish rendering but not get delivered'
		]) {
			expect(routingService.detectStructuralIntent(query)).toBeNull();
		}
	});
});

describe.skipIf(!hasNeo4j)('hybrid retriever', () => {
	let graph: Neo4jGraph;

	beforeAll(async () => {
		graph = await Neo4jGraph.sync(MEDIAOPS);
	}, 120_000);

	afterAll(async () => {
		await closeGraph();
	});

	async function build(opts: { embeddingDown?: boolean } = {}, dataset?: Neo4jGraph): Promise<HybridRetriever> {
		const retriever = new HybridRetriever(new FakeLlmAdapter(opts));
		await retriever.build(dataset ?? graph);
		return retriever;
	}

	it('indexes every graph node, so records and prose are both lexically searchable', async () => {
		const retriever = await build();
		expect(retriever.size).toBe(MEDIAOPS.nodes.length);
		expect((await retriever.health()).status).toBe('up');
	});

	it('reaches the runbook from a job id — the hop the record path could not take', async () => {
		const retriever = await build();
		const evidence = await retriever.retrieve('how do I fix job 482', ctxWith({ jobIds: ['482'], errorCodes: [] }));
		const ids = evidence.map((item) => item.id);

		expect(ids).toContain('job:482');
		expect(ids).toContain('errorCode:RENDER_TIMEOUT');
		expect(ids.some((id) => id.startsWith('runbook-timeouts'))).toBe(true);
	});

	it('carries the hop path on anything reached by traversal', async () => {
		const retriever = await build();
		const evidence = await retriever.retrieve('how do I fix job 482', ctxWith({ jobIds: ['482'], errorCodes: [] }));
		const expanded = evidence.find((item) => Number(item.meta.hops ?? 0) > 0);

		expect(expanded).toBeDefined();
		expect(String(expanded?.meta.hopPath)).toContain('->');
		expect(Array.isArray(expanded?.meta.viaEdges)).toBe(true);
	});

	it('marks an exact anchor as exact and reached in zero hops', async () => {
		const retriever = await build();
		const evidence = await retriever.retrieve('why did job 482 fail', ctxWith({ jobIds: ['482'], errorCodes: [] }));
		const anchor = evidence.find((item) => item.id === 'job:482');

		expect(anchor?.meta.exact).toBe(true);
		expect(anchor?.meta.hops).toBe(0);
		expect(anchor?.meta.retrievedBy).toContain('exact');
	});

	it('still covers records and prose when the embedder is down', async () => {
		const retriever = await build({ embeddingDown: true });

		expect(retriever.hasVectors).toBe(false);
		expect((await retriever.health()).status).toBe('degraded');

		const evidence = await retriever.retrieve('why did job 482 fail', ctxWith({ jobIds: ['482'], errorCodes: [] }));
		expect(evidence.map((item) => item.id)).toContain('job:482');
	});

	it('abstains on an out-of-domain question rather than expanding a weak match', async () => {
		const retriever = await build();

		for (const query of ['what is the capital of France', 'zxqv plorbnat wibble frotz', 'how do I bake sourdough bread']) {
			expect(await retriever.retrieve(query, ctxWith(NO_ANCHORS))).toHaveLength(0);
		}
	});

	it('admits a population named only by its schema type', async () => {
		const commerce = await Neo4jGraph.sync(buildCommerceDataset());
		const retriever = await build({}, commerce);

		const evidence = await retriever.retrieve('rank products by exposure to active incidents', ctxWith(NO_ANCHORS));
		expect(evidence.some((item) => item.id.startsWith('product:'))).toBe(true);

		expect(await retriever.retrieve('what is the boiling point of mercury', ctxWith(NO_ANCHORS))).toHaveLength(0);
	}, 120_000);
});

if (!hasNeo4j) {
	describe('hybrid retriever', () => {
		it.skip(`skipped — ${neo4jSkipReason()}`, () => undefined);
	});
}
