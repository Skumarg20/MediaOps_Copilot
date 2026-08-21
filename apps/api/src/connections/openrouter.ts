import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { config } from '@/config.js';
import { CircuitBreaker, logEvent, logger, recordDependency } from '@/utils/index.js';
import type { DependencyStatus, ModelArm } from '@/types.js';
import { LlmUnavailableError, type GenerateRequest, type GenerateResult, type LlmAdapter } from './llm.types.js';

const CATALOGUE_TIMEOUT_MS = 5_000;

export class OpenRouterAdapter implements LlmAdapter {
	private readonly breaker = new CircuitBreaker(
		'openrouter.generate',
		config.openrouter.circuitThreshold,
		config.openrouter.circuitResetMs
	);

	private readonly provider: OpenRouterProvider;
	private catalogue: { at: number; slugs: Set<string> } | null = null;

	constructor(private readonly apiKey: string = process.env.OPENROUTER_API_KEY ?? '') {
		this.provider = createOpenRouter({ apiKey: this.apiKey });
	}

	private slugFor(model: ModelArm): string {
		return config.openrouter.models[model];
	}

	async generate(req: GenerateRequest): Promise<GenerateResult> {
		if (!this.apiKey) {
			throw new LlmUnavailableError('OPENROUTER_API_KEY is not set');
		}
		if (this.breaker.isOpen) {
			throw new LlmUnavailableError('openrouter generation circuit is open');
		}

		const started = Date.now();
		try {
			const result = await generateText({
				model: this.provider(this.slugFor(req.model)),
				system: req.system,
				prompt: req.prompt,
				temperature: req.temperature ?? 0.1,
				maxTokens: config.openrouter.maxTokens,
				...(req.stop ? { stopSequences: req.stop } : {}),
				abortSignal: AbortSignal.timeout(config.openrouter.generateTimeoutMs)
			});

			this.breaker.recordSuccess();
			return { text: result.text, model: req.model, latencyMs: Date.now() - started };
		} catch (error) {
			this.breaker.recordFailure();
			throw new LlmUnavailableError(`openrouter generation failed for ${req.model}`, error);
		}
	}

	async embed(): Promise<number[][]> {
		throw new LlmUnavailableError('openrouter does not provide embeddings; pair it with a local embedder');
	}

	// Which arms the hosted catalogue is actually serving, cached for one probe TTL.
	// An unreachable catalogue yields an empty set, which the pipeline reads as
	// "mask nothing" rather than as an outage.
	async availableModels(): Promise<Set<string>> {
		if (!this.apiKey) return new Set();

		const now = Date.now();
		if (this.catalogue && now - this.catalogue.at < config.openrouter.probeTtlMs) {
			return this.toArmNames(this.catalogue.slugs);
		}

		let slugs = new Set<string>();
		try {
			const res = await fetch(`${config.openrouter.baseUrl}/models`, {
				headers: { authorization: `Bearer ${this.apiKey}` },
				signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS)
			});
			if (!res.ok) throw new Error(`models endpoint responded ${res.status}`);

			const body = (await res.json()) as { data?: Array<{ id?: string }> };
			slugs = new Set((body.data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id)));
		} catch {
			slugs = new Set();
		}

		this.catalogue = { at: now, slugs };
		return this.toArmNames(slugs);
	}

	private toArmNames(slugs: Set<string>): Set<string> {
		const armNames = new Set<string>();
		for (const model of config.models) {
			if (slugs.has(this.slugFor(model))) armNames.add(model);
		}
		return armNames;
	}

	private generationStatus(available: Set<string>, latencyMs: number): DependencyStatus {
		const name = 'openrouter.generation';

		if (!this.apiKey) {
			return { name, status: 'degraded', detail: 'OPENROUTER_API_KEY is not set', latencyMs };
		}
		if (available.size === 0) {
			return { name, status: 'degraded', detail: 'catalogue unreachable', latencyMs };
		}

		const missing = config.models.filter((model: ModelArm) => !available.has(model));
		if (missing.length > 0) {
			const slugs = missing.map((model) => this.slugFor(model)).join(', ');
			return { name, status: 'degraded', detail: `model slugs not served: ${slugs}`, latencyMs };
		}

		return { name, status: 'up', latencyMs };
	}

	async health(): Promise<{ generation: DependencyStatus; embedding: DependencyStatus }> {
		const started = Date.now();
		const available = await this.availableModels();
		const generation = this.generationStatus(available, Date.now() - started);

		recordDependency(generation.name, generation.status);
		logEvent(logger, 'debug', 'dep.probe', {
			dependency: 'openrouter',
			models: available.size,
			generation: generation.status
		});

		return {
			generation,
			embedding: {
				name: 'openrouter.embedding',
				status: 'degraded',
				detail: 'openrouter serves no embeddings'
			}
		};
	}
}
