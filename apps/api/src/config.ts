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

export const config = {
	env: str('PROJECT_ENV', str('NODE_ENV', 'development')),
	port: num('PORT', 8080),
	version: str('APP_VERSION', '1.0.0'),

	docsDir: path.resolve(here, 'modules/platform/data/mockDocs'),

	ollama: {
		baseUrl: str('OLLAMA_BASE_URL', 'http://localhost:11434'),
		generateTimeoutMs: num('OLLAMA_TIMEOUT_MS', 30_000),
		embedTimeoutMs: num('OLLAMA_EMBED_TIMEOUT_MS', 15_000),
		indexTimeoutMs: num('OLLAMA_INDEX_TIMEOUT_MS', 120_000),
		embedModel: str('OLLAMA_EMBED_MODEL', 'nomic-embed-text'),
		probeTtlMs: num('OLLAMA_PROBE_TTL_MS', 10_000),
		circuitThreshold: num('OLLAMA_CIRCUIT_THRESHOLD', 3),
		circuitResetMs: num('OLLAMA_CIRCUIT_RESET_MS', 30_000),
		maxRetries: num('OLLAMA_MAX_RETRIES', 1)
	},

	llmProvider: str('LLM_PROVIDER', 'hybrid') as 'hybrid' | 'ollama' | 'openrouter',

	openrouter: {
		baseUrl: str('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
		generateTimeoutMs: num('OPENROUTER_TIMEOUT_MS', 30_000),
		maxTokens: num('OPENROUTER_MAX_TOKENS', 512),
		probeTtlMs: num('OPENROUTER_PROBE_TTL_MS', 300_000),
		circuitThreshold: num('OPENROUTER_CIRCUIT_THRESHOLD', 3),
		circuitResetMs: num('OPENROUTER_CIRCUIT_RESET_MS', 30_000),
		models: {
			'llama3.2:3b': str('OPENROUTER_MODEL_LLAMA', 'meta-llama/llama-3.2-3b-instruct'),
			'qwen2.5:3b': str('OPENROUTER_MODEL_QWEN', 'qwen/qwen-2.5-7b-instruct')
		} as Record<ModelArm, string>
	},

	models: ['llama3.2:3b', 'qwen2.5:3b'] as const satisfies readonly ModelArm[],
	paths: ['vector', 'vectorless', 'hybrid'] as const satisfies readonly RetrievalPath[],

	retrieval: {
		topK: num('RETRIEVAL_TOP_K', 3),
		vectorFloor: num('VECTOR_SIMILARITY_FLOOR', 0.45),
		vectorCoverage: num('VECTOR_COVERAGE_FLOOR', 0.4),
		vectorStrongScore: num('VECTOR_STRONG_SCORE', 0.7),
		bm25Floor: num('BM25_SCORE_FLOOR', 1.2),
		bm25Coverage: num('BM25_COVERAGE_FLOOR', 0.5),
		chunkSize: num('CHUNK_SIZE', 500),
		chunkOverlap: num('CHUNK_OVERLAP', 80),
		forceVectorless: bool('FORCE_VECTORLESS', false),

		hybridTopK: num('HYBRID_TOP_K', 6),
		rrfK: num('RRF_K', 60),
		mmrLambda: num('MMR_LAMBDA', 0.7),
		graphMaxHops: num('GRAPH_MAX_HOPS', 2),
		expansionSeeds: num('GRAPH_EXPANSION_SEEDS', 4),
		expansionDiscount: num('GRAPH_EXPANSION_DISCOUNT', 0.9),
		docLinkFloor: num('GRAPH_DOC_LINK_FLOOR', 0.34)
	},

	neo4j: {
		url: str('NEO4J_URL', 'bolt://localhost:7687'),
		user: str('NEO4J_USER', 'neo4j'),
		password: str('NEO4J_PASSWORD', 'copilotgraph'),
		database: str('NEO4J_DATABASE', 'neo4j'),
		poolSize: num('NEO4J_POOL_SIZE', 20),
		timeoutMs: num('NEO4J_TIMEOUT_MS', 15_000)
	},

	agent: {
		maxSteps: num('AGENT_MAX_STEPS', 5)
	},

	rl: {
		epsilonStart: num('RL_EPSILON_START', 0.2),
		epsilonFloor: num('RL_EPSILON_FLOOR', 0.05),
		epsilonDecayPulls: num('RL_EPSILON_DECAY_PULLS', 40),
		optimisticInit: num('RL_OPTIMISTIC_INIT', 10.0),
		feedbackWeight: num('RL_FEEDBACK_WEIGHT', 10),
		hallucinationPenalty: num('RL_HALLUCINATION_PENALTY', 5.0)
	},

	grounding: {
		highBand: num('GROUNDING_HIGH_BAND', 0.45),
		mediumBand: num('GROUNDING_MEDIUM_BAND', 0.25)
	},

	otel: {
		enabled: bool('OTEL_ENABLED', false),
		endpoint: str('OTEL_ENDPOINT', 'http://localhost:4318'),
		serviceName: str('OTEL_SERVICE_NAME', 'mediaops-copilot-api'),
		serviceVersion: str('APP_VERSION', '1.0.0'),
		metricExportIntervalMs: num('OTEL_METRIC_EXPORT_INTERVAL_MS', 10_000)
	},

	logLevel: str('LOG_LEVEL', 'info')
} as const;

export type Config = typeof config;
