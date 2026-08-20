import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { config } from '@/config.js';
import { CircuitBreaker, logEvent, logger, recordDependency } from '@/utils/index.js';
import type { DependencyStatus, ModelArm } from '@/types.js';
import { LlmUnavailableError, type GenerateRequest, type GenerateResult, type LlmAdapter } from './llm.types.js';

export const openrouterProvider = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY ?? ''
});

/**
 * Hosted generation over the same `LlmAdapter` seam the local runtime uses.
 *
 * The bandit's arm keys are the *logical* model names (`llama3.2:3b`), never the
 * provider's slug. That is deliberate: arm statistics are keyed by action string
 * in Postgres, so routing them through a stable logical name means switching
 * provider — or model slug — does not orphan everything the policy has learned.
 */
export class OpenRouterAdapter implements LlmAdapter {
	private readonly breaker = new CircuitBreaker(
		'openrouter.generate',
		config.ollama.circuitThreshold,
		config.ollama.circuitResetMs
	);

	private modelsCache: { at: number; slugs: Set<string> } | null = null;
	private catalogueRefresh: Promise<Set<string>> | null = null;

	constructor(private readonly apiKey: string = process.env.OPENROUTER_API_KEY ?? '') {}

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
				model: openrouterProvider(this.slugFor(req.model)),
				system: req.system,
				prompt: req.prompt,
				temperature: req.temperature ?? 0.1,
				maxTokens: 512,
				...(req.stop ? { stopSequences: req.stop } : {}),
				abortSignal: AbortSignal.timeout(config.ollama.generateTimeoutMs)
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

	/**
	 * Probes the catalogue so a mistyped or retired model slug shows up as a
	 * masked arm — the bandit simply stops selecting it — instead of surfacing as
	 * a runtime failure on every query that happens to draw it.
	 *
	 * Stale-while-revalidate, because the caller is the request path and the
	 * measured latency of a request becomes the latency term of that arm's
	 * reward. A blocking refresh would charge one query per TTL for a network
	 * round trip that has nothing to do with the arm it was routed to, quietly
	 * adding noise to the very signal the policy learns from. A cached answer is
	 * returned immediately and the refresh happens behind it.
	 */
	async availableModels(): Promise<Set<string>> {
		const isFresh = this.modelsCache !== null && Date.now() - this.modelsCache.at < config.ollama.probeTtlMs;

		if (this.modelsCache) {
			if (!isFresh) void this.refreshCatalogue();
			return this.toArmNames(this.modelsCache.slugs);
		}

		if (!this.apiKey) return new Set();

		return this.toArmNames(await this.refreshCatalogue());
	}

	/**
	 * One refresh in flight at a time: a burst of concurrent queries past the TTL
	 * would otherwise each open their own connection to the catalogue.
	 */
	private refreshCatalogue(): Promise<Set<string>> {
		if (this.catalogueRefresh) return this.catalogueRefresh;

		this.catalogueRefresh = (async () => {
			try {
				const res = await fetch(`${config.openrouter.baseUrl}/models`, {
					headers: { authorization: `Bearer ${this.apiKey}` },
					signal: AbortSignal.timeout(5_000)
				});
				if (!res.ok) throw new Error(`models endpoint responded ${res.status}`);

				const body = (await res.json()) as { data?: Array<{ id?: string }> };
				const slugs = new Set(
					(body.data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id))
				);
				this.modelsCache = { at: Date.now(), slugs };
				return slugs;
			} catch {
				this.modelsCache = { at: Date.now(), slugs: new Set() };
				return new Set<string>();
			} finally {
				this.catalogueRefresh = null;
			}
		})();

		return this.catalogueRefresh;
	}

	private toArmNames(slugs: Set<string>): Set<string> {
		const armNames = new Set<string>();
		for (const model of config.models) {
			if (slugs.has(this.slugFor(model))) armNames.add(model);
		}
		return armNames;
	}

	async health(): Promise<{ generation: DependencyStatus; embedding: DependencyStatus }> {
		const started = Date.now();
		const available = await this.availableModels();
		const latencyMs = Date.now() - started;

		const missing = config.models.filter((model: ModelArm) => !available.has(model));
		const generation: DependencyStatus = !this.apiKey
			? { name: 'openrouter.generation', status: 'degraded', detail: 'OPENROUTER_API_KEY is not set', latencyMs }
			: available.size === 0
				? { name: 'openrouter.generation', status: 'degraded', detail: 'catalogue unreachable', latencyMs }
				: missing.length > 0
					? {
							name: 'openrouter.generation',
							status: 'degraded',
							detail: `model slugs not served: ${missing.map((model) => this.slugFor(model)).join(', ')}`,
							latencyMs
						}
					: { name: 'openrouter.generation', status: 'up', latencyMs };

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
