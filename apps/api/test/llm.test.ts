import { describe, expect, it } from 'vitest';
import { HybridLlmAdapter, LlmUnavailableError, type LlmAdapter } from '@/connections/index.js';
import { FakeLlmAdapter } from '@/connections/llmFake.js';
import type { GenerateRequest } from '@/connections/index.js';

const REQUEST: GenerateRequest = {
	model: 'llama3.2:3b',
	system: 'system',
	prompt: 'QUESTION:\nwhy\n\nEVIDENCE:\n[job:482]\nJob 482 failed on worker-07.'
};

/** Records which adapter served the call, so fallback order is observable. */
function labelled(label: string, opts: { down?: boolean } = {}): LlmAdapter & { calls: number } {
	const inner = new FakeLlmAdapter(opts.down ? { generationDown: true } : {});
	const adapter = {
		calls: 0,
		async generate(req: GenerateRequest) {
			adapter.calls += 1;
			const result = await inner.generate(req);
			return { ...result, text: `${label}: ${result.text}` };
		},
		embed: (texts: string[]) => inner.embed(texts),
		availableModels: () => inner.availableModels(),
		health: () => inner.health()
	};
	return adapter;
}

describe('hybrid llm adapter', () => {
	it('generates from the primary runtime when it is healthy', async () => {
		const primary = labelled('hosted');
		const fallback = labelled('local');

		const result = await new HybridLlmAdapter(primary, primary, fallback).generate(REQUEST);

		expect(result.text.startsWith('hosted:')).toBe(true);
		expect(fallback.calls).toBe(0);
	});

	it('falls back to the local runtime when the hosted one fails', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local');

		const result = await new HybridLlmAdapter(primary, fallback, fallback).generate(REQUEST);

		// A hosted outage must cost a retry, not the whole answer.
		expect(result.text.startsWith('local:')).toBe(true);
		expect(fallback.calls).toBe(1);
	});

	it('surfaces the original failure when both runtimes are gone', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local', { down: true });

		await expect(new HybridLlmAdapter(primary, fallback, fallback).generate(REQUEST)).rejects.toBeInstanceOf(
			LlmUnavailableError
		);
	});

	it('propagates the failure when no fallback is configured', async () => {
		const primary = labelled('hosted', { down: true });
		const embedder = labelled('local');

		await expect(new HybridLlmAdapter(primary, embedder).generate(REQUEST)).rejects.toBeInstanceOf(
			LlmUnavailableError
		);
	});

	it('always embeds with the embedding runtime, never the generation one', async () => {
		// The whole point of the split: OpenRouter serves no embeddings, so the
		// vector path must never be routed at it.
		const generation = labelled('hosted', { down: true });
		const embedder = labelled('local');

		const vectors = await new HybridLlmAdapter(generation, embedder, embedder).embed(['why is my render slow']);

		expect(vectors).toHaveLength(1);
		expect(vectors[0]?.length).toBeGreaterThan(0);
	});

	it('offers an arm that either runtime can serve', async () => {
		// A slug missing from the hosted catalogue should fall through to local
		// rather than masking the arm out of the bandit's action space.
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local');

		const models = await new HybridLlmAdapter(primary, fallback, fallback).availableModels();

		expect(models.has('llama3.2:3b')).toBe(true);
		expect(models.has('qwen2.5:3b')).toBe(true);
	});

	it('reports healthy overall while the local runtime can still generate', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local');

		const health = await new HybridLlmAdapter(primary, fallback, fallback).health();

		// A degraded hosted provider is not a degraded system when generation
		// still works — the pill should say so.
		expect(health.generation.status).toBe('up');
		expect(health.generation.detail).toMatch(/hosted provider degraded/i);
		expect(health.embedding.status).toBe('up');
	});

	it('reports degraded when neither runtime can generate', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local', { down: true });

		const health = await new HybridLlmAdapter(primary, fallback, fallback).health();
		expect(health.generation.status).toBe('degraded');
	});
});
