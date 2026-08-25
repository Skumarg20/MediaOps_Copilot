import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { config } from '@/config.js';
import { CircuitBreaker, logEvent, logger } from '@/utils/index.js';
import type { DependencyStatus, ModelArm } from '@/types.js';
import { ttlCache } from './http.js';
import {
	LlmUnavailableError,
	type GenerateRequest,
	type GenerateResult,
	type Generator
} from './llm.types.js';

const CATALOGUE_TIMEOUT_MS = 5_000;

export class OpenRouterAdapter implements Generator {
	private readonly breaker = new CircuitBreaker(
		'openrouter.generate',
		config.openrouter.circuitThreshold,
		config.openrouter.circuitResetMs
	);

	private readonly provider: OpenRouterProvider;

	private readonly catalogue = ttlCache(async (): Promise<Set<string>> => {
		try {
			const res = await fetch(`${config.openrouter.baseUrl}/models`, {
				headers: { authorization: `Bearer ${this.apiKey}` },
				signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS)
			});
			if (!res.ok) throw new Error(`models endpoint responded ${res.status}`);

			const body = (await res.json()) as { data?: Array<{ id?: string }> };
			return new Set((body.data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id)));
		} catch {
			return new Set<string>();
		}
	}, config.openrouter.probeTtlMs);

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

	async availableModels(): Promise<Set<string>> {
		if (!this.apiKey) return new Set();

		const slugs = await this.catalogue();
		const armNames = new Set<string>();
		for (const model of config.models) {
			if (slugs.has(this.slugFor(model))) armNames.add(model);
		}
		return armNames;
	}

	async generationHealth(): Promise<DependencyStatus> {
		const started = Date.now();
		const available = await this.availableModels();
		const latencyMs = Date.now() - started;
		const name = 'openrouter.generation';

		const missing = config.models.filter((model: ModelArm) => !available.has(model));
		const detail = !this.apiKey
			? 'OPENROUTER_API_KEY is not set'
			: available.size === 0
				? 'catalogue unreachable'
				: missing.length > 0
					? `model slugs not served: ${missing.map((model) => this.slugFor(model)).join(', ')}`
					: null;

		const status: DependencyStatus = detail
			? { name, status: 'degraded', detail, latencyMs }
			: { name, status: 'up', latencyMs };

		logEvent(logger, 'debug', 'dep.probe', {
			dependency: 'openrouter',
			models: available.size,
			generation: status.status
		});
		return status;
	}
}
