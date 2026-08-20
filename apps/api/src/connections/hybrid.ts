import { logEvent, logger } from '@/utils/index.js';
import type { DependencyStatus } from '@/types.js';
import { LlmUnavailableError, type GenerateRequest, type GenerateResult, type LlmAdapter } from './llm.types.js';

/**
 * Composes two runtimes behind one adapter: generation from one, embeddings from
 * another.
 *
 * This exists because the split is real, not because indirection is nice.
 * OpenRouter serves no embedding endpoint, and the embedding model is ~270 MB
 * against ~2 GB per generation model — so pairing hosted generation with a local
 * embedder skips 93% of the download while keeping the vector path off the
 * network entirely.
 *
 * Generation also falls back: when the hosted provider is unavailable and a
 * local runtime is reachable, the request retries there rather than degrading
 * straight to a templated record. That adds a rung to the degradation ladder
 * without changing its direction — every step still moves toward determinism.
 */
export class HybridLlmAdapter implements LlmAdapter {
	constructor(
		private readonly generation: LlmAdapter,
		private readonly embedding: LlmAdapter,
		/** Tried when `generation` fails. Usually the local runtime. */
		private readonly generationFallback?: LlmAdapter
	) {}

	/**
	 * Generation with one retry against the fallback runtime.
	 *
	 * When both runtimes are gone the *original* hosted failure is surfaced as the
	 * message: the fallback being down too is a detail, not the cause.
	 */
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

	/**
	 * The union of what each half can serve for its own role. An arm is only
	 * selectable if *some* runtime can generate it — which is what lets a missing
	 * hosted slug fall through to the local runtime instead of masking the arm.
	 */
	async availableModels(): Promise<Set<string>> {
		const [primary, fallback] = await Promise.all([
			this.generation.availableModels(),
			this.generationFallback?.availableModels() ?? Promise.resolve(new Set<string>())
		]);
		return new Set([...primary, ...fallback]);
	}

	/**
	 * Health of the composition rather than of its parts: a degraded hosted
	 * provider is not a degraded system while the local runtime can still
	 * generate, so the reported status is what the pair can do together.
	 */
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
