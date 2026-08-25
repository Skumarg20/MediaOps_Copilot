import { config } from '@/config.js';
import { CircuitBreaker, logEvent, logger } from '@/utils/index.js';
import type { DependencyStatus, ModelArm } from '@/types.js';
import { fetchJson, ttlCache } from './http.js';
import {
	LlmUnavailableError,
	type EmbedOptions,
	type Embedder,
	type GenerateRequest,
	type GenerateResult,
	type Generator
} from './llm.types.js';

type TagsResponse = { models?: Array<{ name?: string; model?: string }> };

export class OllamaAdapter implements Generator, Embedder {
	private readonly genBreaker = new CircuitBreaker(
		'ollama.generate',
		config.ollama.circuitThreshold,
		config.ollama.circuitResetMs
	);
	private readonly embedBreaker = new CircuitBreaker(
		'ollama.embed',
		config.ollama.circuitThreshold,
		config.ollama.circuitResetMs
	);

	private readonly tags = ttlCache(async (): Promise<Set<string>> => {
		try {
			const body = await fetchJson<TagsResponse>(
				`${this.baseUrl}/api/tags`,
				{ method: 'GET' },
				Math.min(config.ollama.embedTimeoutMs, 5_000)
			);
			const tags = new Set<string>();
			for (const m of body.models ?? []) {
				const name = m.name ?? m.model;
				if (!name) continue;
				tags.add(name);
				tags.add(name.split(':')[0] ?? name);
			}
			return tags;
		} catch {
			return new Set<string>();
		}
	}, config.ollama.probeTtlMs);

	constructor(private readonly baseUrl: string = config.ollama.baseUrl) {}

	async availableModels(): Promise<Set<string>> {
		return this.tags();
	}

	async generate(req: GenerateRequest): Promise<GenerateResult> {
		if (this.genBreaker.isOpen) {
			throw new LlmUnavailableError('ollama generation circuit is open');
		}

		const started = Date.now();
		const attempts = config.ollama.maxRetries + 1;
		let lastError: unknown;

		for (let attempt = 0; attempt < attempts; attempt += 1) {
			try {
				const body = await fetchJson<{ response?: string }>(
					`${this.baseUrl}/api/generate`,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							model: req.model,
							system: req.system,
							prompt: req.prompt,
							stream: false,
							options: {
								temperature: req.temperature ?? 0.1,
								num_predict: 512,
								...(req.stop ? { stop: req.stop } : {})
							}
						})
					},
					config.ollama.generateTimeoutMs
				);
				this.genBreaker.recordSuccess();
				return { text: body.response ?? '', model: req.model, latencyMs: Date.now() - started };
			} catch (err) {
				lastError = err;
			}
		}

		this.genBreaker.recordFailure();
		throw new LlmUnavailableError(`ollama generation failed for ${req.model}`, lastError);
	}

	async embed(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
		if (texts.length === 0) return [];
		if (this.embedBreaker.isOpen) {
			throw new LlmUnavailableError('ollama embedding circuit is open');
		}

		try {
			const out: number[][] = [];
			for (const text of texts) {
				const body = await fetchJson<{ embedding?: number[] }>(
					`${this.baseUrl}/api/embeddings`,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ model: config.ollama.embedModel, prompt: text })
					},
					opts.timeoutMs ?? config.ollama.embedTimeoutMs
				);
				if (!body.embedding || body.embedding.length === 0) {
					throw new LlmUnavailableError('ollama returned an empty embedding');
				}
				out.push(body.embedding);
			}
			this.embedBreaker.recordSuccess();
			return out;
		} catch (err) {
			this.embedBreaker.recordFailure();
			throw err instanceof LlmUnavailableError ? err : new LlmUnavailableError('ollama embedding failed', err);
		}
	}

	async generationHealth(): Promise<DependencyStatus> {
		const started = Date.now();
		const tags = await this.tags();
		const latencyMs = Date.now() - started;
		const name = 'ollama.generation';

		const missing = config.models.filter((model: ModelArm) => !tags.has(model));
		const detail =
			tags.size === 0
				? 'runtime unreachable'
				: missing.length === config.models.length
					? 'no expected model tags present'
					: missing.length > 0
						? `missing model tags: ${missing.join(', ')}`
						: null;

		const status: DependencyStatus = detail
			? { name, status: 'degraded', detail, latencyMs }
			: { name, status: 'up', latencyMs };

		logEvent(logger, 'debug', 'dep.probe', { dependency: 'ollama', tags: tags.size, generation: status.status });
		return status;
	}

	async embeddingHealth(): Promise<DependencyStatus> {
		const started = Date.now();
		const tags = await this.tags();
		const latencyMs = Date.now() - started;
		const name = 'ollama.embedding';

		return tags.has(config.ollama.embedModel)
			? { name, status: 'up', latencyMs }
			: {
					name,
					status: 'degraded',
					detail: `missing embedding model tag: ${config.ollama.embedModel}`,
					latencyMs
				};
	}
}
