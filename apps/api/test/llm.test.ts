import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { LlmUnavailableError, withFallback, type GenerateRequest, type Generator } from '@/connections/index.js';
import { fetchJson, ttlCache } from '@/connections/http.js';
import { FakeLlmAdapter } from '@/connections/llmFake.js';

const REQUEST: GenerateRequest = {
	model: 'llama3.2:3b',
	system: 'system',
	prompt: 'QUESTION:\nwhy\n\nEVIDENCE:\n[job:482]\nJob 482 failed on worker-07.'
};

function labelled(label: string, opts: { down?: boolean } = {}): Generator & { calls: number } {
	const inner = new FakeLlmAdapter(opts.down ? { generationDown: true } : {});
	const generator = {
		calls: 0,
		async generate(req: GenerateRequest) {
			generator.calls += 1;
			const result = await inner.generate(req);
			return { ...result, text: `${label}: ${result.text}` };
		},
		availableModels: () => inner.availableModels(),
		generationHealth: () => inner.generationHealth()
	};
	return generator;
}

describe('generation fallback', () => {
	it('generates from the primary runtime when it is healthy', async () => {
		const primary = labelled('hosted');
		const fallback = labelled('local');

		const result = await withFallback(primary, fallback).generate(REQUEST);

		expect(result.text.startsWith('hosted:')).toBe(true);
		expect(fallback.calls).toBe(0);
	});

	it('falls back to the local runtime when the hosted one fails', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local');

		const result = await withFallback(primary, fallback).generate(REQUEST);

		expect(result.text.startsWith('local:')).toBe(true);
		expect(fallback.calls).toBe(1);
	});

	it('names both runtimes when neither can generate', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local', { down: true });

		await expect(withFallback(primary, fallback).generate(REQUEST)).rejects.toBeInstanceOf(LlmUnavailableError);
		await expect(withFallback(primary, fallback).generate(REQUEST)).rejects.toThrow(/hosted provider and local fallback/i);
	});

	it('offers an arm that either runtime can serve', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local');

		const models = await withFallback(primary, fallback).availableModels();

		expect(models.has('llama3.2:3b')).toBe(true);
		expect(models.has('qwen2.5:3b')).toBe(true);
	});

	it('reports healthy overall while the local runtime can still generate', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local');

		const health = await withFallback(primary, fallback).generationHealth();

		expect(health.status).toBe('up');
		expect(health.name).toBe('llm.generation');
		expect(health.detail).toMatch(/hosted provider degraded/i);
	});

	it('reports degraded when neither runtime can generate', async () => {
		const primary = labelled('hosted', { down: true });
		const fallback = labelled('local', { down: true });

		const health = await withFallback(primary, fallback).generationHealth();

		expect(health.status).toBe('degraded');
		expect(health.name).toBe('llm.generation');
	});
});

describe('embedding is never routed to a hosted generator', () => {
	it('embeds through the local runtime even while generation is down', async () => {
		const local = new FakeLlmAdapter({ generationDown: true });

		const vectors = await local.embed(['why is my render slow']);

		expect(vectors).toHaveLength(1);
		expect(vectors[0]?.length).toBeGreaterThan(0);
	});
});

describe('shared transport', () => {
	async function listen(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
		const server = http.createServer(handler);
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;
		return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
	}

	it('reports a deadline as a timeout, not as a connectivity fault', async () => {
		const timer: NodeJS.Timeout[] = [];
		const server = await listen((_req, res) => {
			timer.push(setTimeout(() => res.end('{}'), 5_000));
		});

		try {
			const attempt = fetchJson(server.url, { method: 'GET' }, 150);
			await expect(attempt).rejects.toBeInstanceOf(LlmUnavailableError);
			await expect(attempt).rejects.toThrow(/timed out after 150ms/);
		} finally {
			for (const t of timer) clearTimeout(t);
			server.close();
		}
	});

	it('reports a non-2xx with its status', async () => {
		const server = await listen((_req, res) => {
			res.statusCode = 503;
			res.end('nope');
		});

		try {
			await expect(fetchJson(server.url, { method: 'GET' }, 2_000)).rejects.toThrow(/responded 503/);
		} finally {
			server.close();
		}
	});

	it('reports a refused connection as unreachable', async () => {
		await expect(fetchJson('http://127.0.0.1:1/', { method: 'GET' }, 2_000)).rejects.toThrow(/unreachable/);
	});

	it('shares one in-flight probe between concurrent callers', async () => {
		let loads = 0;
		const probe = ttlCache(async () => {
			loads += 1;
			return loads;
		}, 10_000);

		await Promise.all([probe(), probe(), probe()]);
		await probe();

		expect(loads).toBe(1);
	});

	it('does not cache a rejection, so a transient failure can recover', async () => {
		let loads = 0;
		const probe = ttlCache(async () => {
			loads += 1;
			throw new Error('boom');
		}, 10_000);

		await expect(probe()).rejects.toThrow('boom');
		await expect(probe()).rejects.toThrow('boom');

		expect(loads).toBe(2);
	});
});
