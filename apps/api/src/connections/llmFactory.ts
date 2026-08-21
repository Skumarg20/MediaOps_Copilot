import { config } from '@/config.js';
import { logEvent, logger } from '@/utils/index.js';
import { HybridLlmAdapter } from './hybrid.js';
import type { LlmAdapter } from './llm.types.js';
import { OllamaAdapter } from './ollama.js';
import { OpenRouterAdapter } from './openrouter.js';

export function createLlmAdapter(): LlmAdapter {
	const ollama = new OllamaAdapter();
	const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);

	switch (config.llmProvider) {
		case 'ollama':
			logEvent(logger, 'info', 'dep.probe', { dependency: 'llm', provider: 'ollama' });
			return ollama;

		case 'openrouter':
			logEvent(logger, 'info', 'dep.probe', {
				dependency: 'llm',
				provider: 'openrouter',
				embeddings: 'ollama',
				fallback: 'none'
			});
			return new HybridLlmAdapter(new OpenRouterAdapter(), ollama);

		case 'hybrid':
		default:
			if (!hasOpenRouterKey) {
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
