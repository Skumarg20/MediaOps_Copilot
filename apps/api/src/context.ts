import { config } from '@/config.js';
import { createLlmAdapter, type LlmAdapter } from '@/connections/index.js';
import { triageClassifier } from '@/modules/classifier/index.js';
import { grounder } from '@/modules/grounding/index.js';
import { platformService } from '@/modules/platform/index.js';
import { EpsilonGreedyBandit, type BanditOptions } from '@/modules/rl/index.js';
import { VectorRetriever, VectorlessRetriever } from '@/modules/retrieval/index.js';
import { logEvent, logger } from '@/utils/index.js';
import type { Classifier, Grounder, Policy } from '@/types.js';

/**
 * The composition root.
 *
 * Modules reach for the pieces they need through `getContext()` rather than
 * receiving a services bag through every call signature — the same shape as the
 * platform's `connections/` singletons, and the reason a service function can be
 * called from a tRPC procedure, a REST handler, or a test without ceremony.
 */
export interface AppContext {
	llm: LlmAdapter;
	vector: VectorRetriever;
	vectorless: VectorlessRetriever;
	bandit: Policy;
	classifier: Classifier;
	grounder: Grounder;
	startedAt: number;
}

let context: AppContext | null = null;

export interface BuildContextOptions {
	llm?: LlmAdapter;
	bandit?: BanditOptions;
	/** Skip boot-time embedding; tests that never touch the vector path save time. */
	skipIndex?: boolean;
	docsDir?: string;
	/** Reference data is already present — used by tests that seed once per suite. */
	skipSeed?: boolean;
}

/**
 * Builds the singleton context.
 *
 * A failed vector index is non-fatal: the service starts degraded and serves
 * vectorless answers rather than refusing to boot, because start-up order is not
 * a correctness dependency.
 */
export async function buildContext(opts: BuildContextOptions = {}): Promise<AppContext> {
	if (!opts.skipSeed) await platformService.seedReferenceData();

	const llm = opts.llm ?? createLlmAdapter();
	const vector = new VectorRetriever(llm, opts.docsDir ?? config.docsDir);
	const vectorless = new VectorlessRetriever();
	const records = await vectorless.build();

	const bandit = new EpsilonGreedyBandit(opts.bandit);
	await bandit.init();

	if (!opts.skipIndex) {
		const vectorIndexResult = await vector.build();
		if (vectorIndexResult.error) {
			logEvent(logger, 'warn', 'boot.indexed', {
				error: vectorIndexResult.error,
				note: 'vector path disabled; serving vectorless'
			});
		}
	}

	logEvent(logger, 'info', 'boot.seeded', {
		vectorless_records: records,
		vector_chunks: vector.size
	});

	context = {
		llm,
		vector,
		vectorless,
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

/** Test seam: swap the whole context without going through boot. */
export function setContext(next: AppContext | null): void {
	context = next;
}
