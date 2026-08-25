import { config } from '@/config.js';
import { logEvent, logger } from '@/utils/index.js';
import type { DependencyStatus } from '@/types.js';
import { LlmUnavailableError, type Embedder, type Generator } from './llm.types.js';
import { OllamaAdapter } from './ollama.js';
import { OpenRouterAdapter } from './openrouter.js';

export function withFallback(primary: Generator, fallback: Generator): Generator {
	return {
		async generate(req) {
			try {
				return await primary.generate(req);
			} catch (error) {
				logEvent(logger, 'warn', 'agent.degraded', {
					reason: error instanceof Error ? error.message : String(error),
					fallback: 'local generation runtime'
				});

				try {
					return await fallback.generate(req);
				} catch (fallbackError) {
					throw new LlmUnavailableError(
						`generation unavailable from hosted provider and local fallback for ${req.model}`,
						{ primary: error, fallback: fallbackError }
					);
				}
			}
		},

		async availableModels() {
			const [hosted, local] = await Promise.all([primary.availableModels(), fallback.availableModels()]);
			return new Set([...hosted, ...local]);
		},

		async generationHealth(): Promise<DependencyStatus> {
			const hosted = await primary.generationHealth();
			if (hosted.status === 'up') return hosted;

			const local = await fallback.generationHealth();
			return local.status === 'up'
				? {
						...local,
						name: 'llm.generation',
						detail: `hosted provider degraded (${hosted.detail ?? 'unknown'}); serving from the local runtime`
					}
				: { ...hosted, name: 'llm.generation' };
		}
	};
}

export function createLlm(): { generator: Generator; embedder: Embedder } {
	const ollama = new OllamaAdapter();
	const apiKey = process.env.OPENROUTER_API_KEY;

	if (config.llmProvider === 'ollama') {
		logEvent(logger, 'info', 'dep.probe', { dependency: 'llm', provider: 'ollama' });
		return { generator: ollama, embedder: ollama };
	}

	if (!apiKey && config.llmProvider !== 'openrouter') {
		logEvent(logger, 'warn', 'dep.probe', {
			dependency: 'llm',
			provider: 'ollama',
			reason: `LLM_PROVIDER=${config.llmProvider} but OPENROUTER_API_KEY is unset`
		});
		return { generator: ollama, embedder: ollama };
	}

	const hosted = new OpenRouterAdapter(apiKey);
	const fallback = config.llmProvider === 'openrouter' ? null : ollama;

	logEvent(logger, 'info', 'dep.probe', {
		dependency: 'llm',
		provider: 'openrouter',
		embeddings: 'ollama',
		fallback: fallback ? 'ollama' : 'none'
	});

	return { generator: fallback ? withFallback(hosted, fallback) : hosted, embedder: ollama };
}
