import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelArm, RetrievalPath } from '@/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function num(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function str(name: string, fallback: string): string {
	const raw = process.env[name];
	return raw === undefined || raw === '' ? fallback : raw;
}

function bool(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * Every knob has a safe default, so the service starts with no environment at
 * all beyond the database. Secrets are absent by construction: the local-model
 * choice removes the API-key surface entirely.
 */
export const config = {
	env: str('PROJECT_ENV', str('NODE_ENV', 'development')),
	port: num('PORT', 8080),
	version: str('APP_VERSION', '1.0.0'),

	/** Seed corpus lives beside the source so it ships inside the image. */
	docsDir: path.resolve(here, 'modules/platform/data/mockDocs'),

	ollama: {
		baseUrl: str('OLLAMA_BASE_URL', 'http://localhost:11434'),
		generateTimeoutMs: num('OLLAMA_TIMEOUT_MS', 30_000),
		embedTimeoutMs: num('OLLAMA_EMBED_TIMEOUT_MS', 15_000),
		embedModel: str('OLLAMA_EMBED_MODEL', 'nomic-embed-text'),
		/** Probe result is cached so /health does not stampede the runtime. */
		probeTtlMs: num('OLLAMA_PROBE_TTL_MS', 10_000),
		/** Consecutive failures before the circuit opens. */
		circuitThreshold: num('OLLAMA_CIRCUIT_THRESHOLD', 3),
		circuitResetMs: num('OLLAMA_CIRCUIT_RESET_MS', 30_000),
		maxRetries: num('OLLAMA_MAX_RETRIES', 1)
	},

	/**
	 * Which runtime serves generation. `hybrid` is the default: hosted generation
	 * (fast, no multi-GB download) paired with local embeddings (small, and the
	 * only way to keep the vector path off the network). `ollama` is the fully
	 * local path the design started from and the fallback when a key is absent.
	 */
	llmProvider: str('LLM_PROVIDER', 'hybrid') as 'hybrid' | 'ollama' | 'openrouter',

	openrouter: {
		baseUrl: str('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
		/**
		 * Logical arm name → provider slug. The bandit keys its arms by the
		 * logical name, so a provider or slug change never orphans learned
		 * statistics. Verify these against OpenRouter's catalogue — a wrong slug
		 * surfaces as a masked (unselectable) arm, not as a runtime error.
		 */
		models: {
			'llama3.2:3b': str('OPENROUTER_MODEL_LLAMA', 'meta-llama/llama-3.2-3b-instruct'),
			'qwen2.5:3b': str('OPENROUTER_MODEL_QWEN', 'qwen/qwen-2.5-7b-instruct')
		} as Record<ModelArm, string>
	},

	models: ['llama3.2:3b', 'qwen2.5:3b'] as const satisfies readonly ModelArm[],
	paths: ['vector', 'vectorless'] as const satisfies readonly RetrievalPath[],

	retrieval: {
		topK: num('RETRIEVAL_TOP_K', 3),
		/** Below the floor the vector path returns no evidence rather than a guess. */
		vectorFloor: num('VECTOR_SIMILARITY_FLOOR', 0.45),
		bm25Floor: num('BM25_SCORE_FLOOR', 1.2),
		/**
		 * Minimum share of the query's content terms a BM25 hit must contain.
		 * Guards the case a score floor cannot: one common term dragging an
		 * irrelevant record over the line.
		 */
		bm25Coverage: num('BM25_COVERAGE_FLOOR', 0.5),
		chunkSize: num('CHUNK_SIZE', 500),
		chunkOverlap: num('CHUNK_OVERLAP', 80),
		/** Operator escape hatch from the 3am runbook: force the deterministic path. */
		forceVectorless: bool('FORCE_VECTORLESS', false)
	},

	agent: {
		maxSteps: num('AGENT_MAX_STEPS', 3)
	},

	rl: {
		epsilonStart: num('RL_EPSILON_START', 0.2),
		epsilonFloor: num('RL_EPSILON_FLOOR', 0.05),
		/** Pulls per state at which epsilon has decayed to the floor. */
		epsilonDecayPulls: num('RL_EPSILON_DECAY_PULLS', 40),
		/** Optimistic initialisation guarantees every arm is tried once. */
		optimisticInit: num('RL_OPTIMISTIC_INIT', 5.0),
		feedbackWeight: num('RL_FEEDBACK_WEIGHT', 10),
		hallucinationPenalty: num('RL_HALLUCINATION_PENALTY', 5.0)
	},

	grounding: {
		highBand: num('GROUNDING_HIGH_BAND', 0.45),
		mediumBand: num('GROUNDING_MEDIUM_BAND', 0.25)
	},

	logLevel: str('LOG_LEVEL', 'info')
} as const;

export type Config = typeof config;
