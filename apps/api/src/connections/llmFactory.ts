import { config } from '@/config.js';
import { logEvent, logger } from '@/utils/index.js';
import { HybridLlmAdapter } from './hybrid.js';
import type { LlmAdapter } from './llm.types.js';
import { OllamaAdapter } from './ollama.js';
import { OpenRouterAdapter } from './openrouter.js';

/**
 * Chooses the model runtime at boot from `LLM_PROVIDER`.
 *
 * The choice is a composition detail, not a behavioural one: every caller is
 * written against `LlmAdapter`, so the ReAct loop, the grounding gate, the
 * bandit, and every route are identical whichever branch runs.
 */
export function createLlmAdapter(): LlmAdapter {
	const ollama = new OllamaAdapter();
	const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

	switch (config.llmProvider) {
		case 'ollama':
			logEvent(logger, 'info', 'dep.probe', { dependency: 'llm', provider: 'ollama' });
			return ollama;

		case 'openrouter':
			// Generation hosted, embeddings still local — OpenRouter serves none.
			logEvent(logger, 'info', 'dep.probe', {
				dependency: 'llm',
				provider: 'openrouter',
				embeddings: 'ollama',
				fallback: 'none'
			});
			return new HybridLlmAdapter(new OpenRouterAdapter(), ollama);

		case 'hybrid':
		default:
			if (!hasKey) {
				// Falling back silently would be worse than either choice: the
				// operator would see local latency and wonder why.
				logEvent(logger, 'warn', 'dep.probe', {
					dependency: 'llm',
					provider: 'ollama',
					reason: 'LLM_PROVIDER=hybrid but OPENROUTER_API_KEY is unset'
				});
				return ollama;
			}

			logEvent(logger, 'info', 'dep.probe', {
				dependency: 'llm',
				provider: 'openrouter',
				embeddings: 'ollama',
				fallback: 'ollama'
			});
			return new HybridLlmAdapter(new OpenRouterAdapter(), ollama, ollama);
	}
}
