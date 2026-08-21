import { logEvent, logger } from '@/utils/index.js';
import type { DependencyStatus } from '@/types.js';
import { LlmUnavailableError, type GenerateRequest, type GenerateResult, type LlmAdapter } from './llm.types.js';

export class HybridLlmAdapter implements LlmAdapter {
	constructor(
		private readonly generation: LlmAdapter,
		private readonly embedding: LlmAdapter,
		private readonly generationFallback?: LlmAdapter
	) {}

	async generate(req: GenerateRequest): Promise<GenerateResult> {
		try {
			return await this.generation.generate(req);
		} catch (error) {
			if (!this.generationFallback) throw error;

			logEvent(logger, 'warn', 'agent.degraded', {
				reason: error instanceof Error ? error.message : String(error),
				fallback: 'local generation runtime'
			});

			try {
				return await this.generationFallback.generate(req);
			} catch (fallbackError) {
				throw new LlmUnavailableError(
					`generation unavailable from hosted provider and local fallback for ${req.model}`,
					{ primary: error, fallback: fallbackError }
				);
			}
		}
	}

	async embed(texts: string[]): Promise<number[][]> {
		return this.embedding.embed(texts);
	}

	async availableModels(): Promise<Set<string>> {
		const [primary, fallback] = await Promise.all([
			this.generation.availableModels(),
			this.generationFallback?.availableModels() ?? Promise.resolve(new Set<string>())
		]);
		return new Set([...primary, ...fallback]);
	}

	async health(): Promise<{ generation: DependencyStatus; embedding: DependencyStatus }> {
		const [generationHealth, embeddingHealth, fallbackHealth] = await Promise.all([
			this.generation.health(),
			this.embedding.health(),
			this.generationFallback?.health()
		]);

		const compositeGenerationStatus =
			generationHealth.generation.status === 'up'
				? generationHealth.generation
				: fallbackHealth?.generation.status === 'up'
					? {
							...fallbackHealth.generation,
							name: 'llm.generation',
							detail: `hosted provider degraded (${generationHealth.generation.detail ?? 'unknown'}); serving from the local runtime`
						}
					: {
							...generationHealth.generation,
							name: 'llm.generation'
						};

		return {
			generation: compositeGenerationStatus,
			embedding: { ...embeddingHealth.embedding, name: 'llm.embedding' }
		};
	}
}
