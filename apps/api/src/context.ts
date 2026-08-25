import { config } from '@/config.js';
import { createLlm, type Embedder, type Generator, type LlmAdapter } from '@/connections/index.js';
import { triageClassifier } from '@/modules/classifier/index.js';
import { loadMediaOpsGraph, type Neo4jGraph } from '@/modules/graph/index.js';
import { grounder } from '@/modules/grounding/index.js';
import { platformService } from '@/modules/platform/index.js';
import { EpsilonGreedyBandit, type BanditOptions } from '@/modules/rl/index.js';
import { HybridRetriever, VectorRetriever, VectorlessRetriever } from '@/modules/retrieval/index.js';
import { logEvent, logger } from '@/utils/index.js';
import type { Classifier, Grounder, Policy } from '@/types.js';

export interface AppContext {
	generator: Generator;
	embedder: Embedder;
	vector: VectorRetriever;
	vectorless: VectorlessRetriever;
	hybrid: HybridRetriever;
	graph: Neo4jGraph;
	bandit: Policy;
	classifier: Classifier;
	grounder: Grounder;
	startedAt: number;
}

let context: AppContext | null = null;

export interface BuildContextOptions {
	llm?: LlmAdapter;
	bandit?: BanditOptions;
	skipIndex?: boolean;
	docsDir?: string;
	skipSeed?: boolean;
}

const INDEX_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 240_000];

function retryVectorIndex(vector: VectorRetriever, attempt = 0): void {
	const delay = INDEX_RETRY_DELAYS_MS[attempt];
	if (delay === undefined) {
		logEvent(logger, 'warn', 'boot.indexed', {
			note: 'vector index retries exhausted; serving vectorless until restart'
		});
		return;
	}

	setTimeout(() => {
		void (async () => {
			const result = await vector.build();
			if (!result.error) {
				logEvent(logger, 'info', 'boot.indexed', {
					chunks: result.indexed,
					note: 'vector path recovered on retry ' + String(attempt + 1)
				});
				return;
			}

			logEvent(logger, 'warn', 'boot.indexed', { error: result.error, retry: attempt + 1 });
			retryVectorIndex(vector, attempt + 1);
		})();
	}, delay).unref();
}

export async function buildContext(opts: BuildContextOptions = {}): Promise<AppContext> {
	if (!opts.skipSeed) await platformService.seedReferenceData();

	const { generator, embedder } = opts.llm ? { generator: opts.llm, embedder: opts.llm } : createLlm();
	const vector = new VectorRetriever(embedder, opts.docsDir ?? config.docsDir);
	const vectorless = new VectorlessRetriever();
	const records = await vectorless.build();

	const graph = await loadMediaOpsGraph({
		...(opts.docsDir ? { docsDir: opts.docsDir } : {}),
		linkOverlapFloor: config.retrieval.docLinkFloor
	});
	const hybrid = new HybridRetriever(embedder);

	const bandit = new EpsilonGreedyBandit(opts.bandit);
	await bandit.init();

	if (!opts.skipIndex) {
		const [vectorIndexResult] = await Promise.all([vector.build(), hybrid.build(graph)]);
		if (vectorIndexResult.error) {
			logEvent(logger, 'warn', 'boot.indexed', {
				error: vectorIndexResult.error,
				note: 'vector path disabled; serving vectorless while retries run'
			});
			retryVectorIndex(vector);
		}
	} else {
		await hybrid.build(graph);
	}

	logEvent(logger, 'info', 'boot.seeded', {
		vectorless_records: records,
		vector_chunks: vector.size,
		graph_nodes: graph.nodeCount,
		graph_edges: graph.edgeCount
	});

	context = {
		generator,
		embedder,
		vector,
		vectorless,
		hybrid,
		graph,
		bandit,
		classifier: triageClassifier,
		grounder,
		startedAt: Date.now()
	};

	return context;
}

export function getContext(): AppContext {
	if (!context) {
		throw new Error('application context has not been built — call buildContext() during boot');
	}
	return context;
}

export function setContext(next: AppContext | null): void {
	context = next;
}
