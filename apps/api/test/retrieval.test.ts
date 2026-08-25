import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setDb } from '@/connections/index.js';
import { FakeLlmAdapter } from '@/connections/llmFake.js';
import { platformService } from '@/modules/platform/index.js';
import { Bm25Index, VectorRetriever, VectorlessRetriever, retrievalService } from '@/modules/retrieval/index.js';
import { routingService } from '@/modules/routing/index.js';
import type { QueryContext, Triage } from '@/types.js';
import { createTestDb, destroyTestDb, isPostgresAvailable, skipReason } from './helpers/db.js';

const { chunkMarkdown, cosine, loadCorpus } = retrievalService;

const TRIAGE: Triage = {
	class: 'complex_diagnostic',
	confidence: 0.9,
	topFeatures: [],
	scores: { simple_lookup: 0.05, complex_diagnostic: 0.9, urgent_incident: 0.05 }
};

function ctxWith(anchors: QueryContext['anchors']): QueryContext {
	return { transactionId: 'test-tx', triage: TRIAGE, anchors };
}

const NO_ANCHORS = { jobIds: [], errorCodes: [] };

describe('chunker', () => {
	it('produces heading-aware chunks with stable, citable ids', () => {
		const chunks = chunkMarkdown(
			'runbook-test',
			'# Title\n\nFirst paragraph body.\n\n## Section A\n\nSecond paragraph body.'
		);

		expect(chunks.length).toBeGreaterThanOrEqual(2);
		expect(chunks[0]?.id).toBe('runbook-test#c0');
		expect(chunks.every((chunk) => chunk.docId === 'runbook-test')).toBe(true);
		expect(chunks.some((chunk) => chunk.heading === 'Section A' && chunk.text.includes('Section A'))).toBe(true);
	});

	it('loads every runbook in the corpus', () => {
		const docs = new Set(loadCorpus().map((chunk) => chunk.docId));

		expect(docs.size).toBeGreaterThanOrEqual(4);
		expect(docs).toContain('runbook-performance-degradation');
		expect(docs).toContain('runbook-timeouts-and-retries');
	});
});

describe('bm25', () => {
	it('ranks the document containing the query terms first', () => {
		const index = new Bm25Index([
			{ id: 'a', text: 'render timeout budget exceeded on the worker', meta: {} },
			{ id: 'b', text: 'font missing from the render image font set', meta: {} }
		]);

		expect(index.search('timeout budget', 2)[0]?.id).toBe('a');
	});

	it('reports how much of the query a hit actually covers', () => {
		const index = new Bm25Index([{ id: 'a', text: 'render timeout budget exceeded', meta: {} }]);
		const [hit] = index.search('render unicorn', 2);

		expect(hit?.coverage).toBeCloseTo(0.5, 4);
	});

	it('returns nothing for a query with no matching terms', () => {
		const index = new Bm25Index([{ id: 'a', text: 'render timeout budget', meta: {} }]);
		expect(index.search('zxqv plorbnat', 3)).toHaveLength(0);
	});

	it('returns nothing when the index is empty', () => {
		expect(new Bm25Index().search('anything', 3)).toHaveLength(0);
	});
});

describe('cosine similarity', () => {
	it('scores correctly at the boundaries', () => {
		expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 6);
		expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
		expect(cosine([0, 0], [1, 1])).toBe(0);
	});
});

describe('vector path — where semantic retrieval genuinely wins', () => {
	it('surfaces the performance-degradation runbook for a query sharing none of its vocabulary', async () => {
		const retriever = new VectorRetriever(new FakeLlmAdapter());
		expect((await retriever.build()).indexed).toBeGreaterThan(0);

		const evidence = await retriever.retrieve('why is my render slower than usual', ctxWith(NO_ANCHORS));

		expect(evidence.length).toBeGreaterThan(0);
		expect(evidence.length).toBeLessThanOrEqual(3);
		expect(evidence.some((item) => item.meta.docId === 'runbook-performance-degradation')).toBe(true);
	});

	it('returns nothing rather than a best guess when the query is nonsense', async () => {
		const retriever = new VectorRetriever(new FakeLlmAdapter());
		await retriever.build();

		expect(await retriever.retrieve('zxqv plorbnat wibble frotz', ctxWith(NO_ANCHORS))).toHaveLength(0);
	});

	it('reports degraded and retrieves nothing when embeddings are unavailable', async () => {
		const retriever = new VectorRetriever(new FakeLlmAdapter({ embeddingDown: true }));

		expect((await retriever.build()).indexed).toBe(0);
		expect((await retriever.health()).status).toBe('degraded');
		expect(await retriever.retrieve('why is my render slower than usual', ctxWith(NO_ANCHORS))).toHaveLength(0);
	});
});

describe('hard routing rules', () => {
	const healthy = { vectorAvailable: true, forceVectorless: false };

	it('pins vectorless on an exact error-code match', () => {
		const pin = routingService.decidePin({ ...healthy, anchors: { jobIds: [], errorCodes: ['RENDER_TIMEOUT'] } });

		expect(pin.path).toBe('vectorless');
		expect(pin.code).toBe('error_code_exact_match');
		expect(pin.deterministic).toBe(true);
	});

	it('leaves the path to the bandit when no anchor resolves', () => {
		const pin = routingService.decidePin({ ...healthy, anchors: NO_ANCHORS });

		expect(pin.path).toBeNull();
		expect(pin.deterministic).toBe(false);
	});

	it('reports the exact match, not the outage, when both apply', () => {
		const pin = routingService.decidePin({
			anchors: { jobIds: ['482'], errorCodes: [] },
			vectorAvailable: false,
			forceVectorless: false
		});

		expect(pin.code).toBe('job_id_exact_match');
		expect(pin.reason).toContain('482');
	});

	it('reports a genuine degradation when no anchor resolved', () => {
		const pin = routingService.decidePin({
			anchors: NO_ANCHORS,
			vectorAvailable: false,
			forceVectorless: false
		});

		expect(pin.code).toBe('vector_unavailable');
		expect(pin.path).toBe('hybrid');
	});

	it('honours the operator override above everything else', () => {
		const pin = routingService.decidePin({
			anchors: NO_ANCHORS,
			vectorAvailable: true,
			forceVectorless: true
		});

		expect(pin.code).toBe('forced_by_config');
	});
});

const hasPostgres = await isPostgresAvailable();

describe.skipIf(!hasPostgres)('vectorless path — where deterministic lookup genuinely wins', () => {
	let db: Knex;
	let retriever: VectorlessRetriever;

	beforeAll(async () => {
		db = await createTestDb('retrieval');
		setDb(db);
		await platformService.seedReferenceData();
		retriever = new VectorlessRetriever();
		await retriever.build();
	});

	afterAll(async () => {
		await destroyTestDb(db);
	});

	async function retrieve(query: string) {
		const anchors = await routingService.extractAnchors({ query });
		return retriever.retrieve(query, ctxWith(anchors));
	}

	it('returns exactly the glossary row for a known error code', async () => {
		const evidence = await retrieve('what does error code RENDER_TIMEOUT mean');

		expect(evidence).toHaveLength(1);
		expect(evidence[0]?.id).toBe('errorCode:RENDER_TIMEOUT');
		expect(evidence[0]?.meta.exact).toBe(true);
		expect(evidence[0]?.text).toContain('exceeds the render time budget');

		const ids = evidence.map((item) => item.id);
		expect(ids).not.toContain('errorCode:RENDER_STALLED');
		expect(ids).not.toContain('errorCode:UPLOAD_TIMEOUT');
	});

	it("returns the job's own fields for a job id, with a primary-key citation", async () => {
		const evidence = await retrieve('why did job 482 fail');
		const job = evidence.find((item) => item.id === 'job:482');

		expect(job).toBeDefined();
		expect(job?.text).toContain('worker-07');
		expect(job?.text).toContain('1802');
		expect(job?.meta.failureReason).toBe('RENDER_TIMEOUT');
	});

	it("follows the job's failure reason into the glossary", async () => {
		const evidence = await retrieve('why did job 482 fail');
		const code = evidence.find((item) => item.id === 'errorCode:RENDER_TIMEOUT');

		expect(code).toBeDefined();
		expect(code?.meta.viaJob).toBe('482');
	});

	it('falls back to BM25 for a keyword query with no exact key', async () => {
		const evidence = await retrieve('worker-07 duration');

		expect(evidence.length).toBeGreaterThan(0);
		expect(evidence.every((item) => item.score !== undefined)).toBe(true);
	});

	it('returns nothing rather than a best guess when nothing clears the floors', async () => {
		expect(await retrieve('zxqv plorbnat wibble frotz')).toHaveLength(0);
	});

	it('abstains on an open-ended query it genuinely cannot serve', async () => {
		expect(await retrieve('why is my render slower than usual')).toHaveLength(0);
	});

	describe('anchor resolution', () => {
		it('resolves job ids and error codes only when they exist in the store', async () => {
			expect(await routingService.extractAnchors({ query: 'job 482 hit RENDER_TIMEOUT' })).toEqual({
				jobIds: ['482'],
				errorCodes: ['RENDER_TIMEOUT']
			});
		});

		it('does not treat an arbitrary number as a job id', async () => {
			const anchors = await routingService.extractAnchors({ query: 'the render took 1802 seconds' });
			expect(anchors.jobIds).toEqual([]);
		});

		it('does not treat an unknown code as an error code', async () => {
			const anchors = await routingService.extractAnchors({ query: 'what does GPU_MELTDOWN mean' });
			expect(anchors.errorCodes).toEqual([]);
		});

		it('matches a hashed job reference', async () => {
			const anchors = await routingService.extractAnchors({ query: 'why did job #482 fail' });
			expect(anchors.jobIds).toEqual(['482']);
		});
	});
});

if (!hasPostgres) {
	describe('vectorless path', () => {
		it.skip(`skipped — ${skipReason()}`, () => {});
	});
}
