import { config } from '@/config.js';
import { CircuitBreaker, logEvent, logger } from '@/utils/index.js';
import { recordDependency } from '@/utils/index.js';
import type { DependencyStatus, ModelArm } from '@/types.js';
import {
  LlmUnavailableError,
  type GenerateRequest,
  type GenerateResult,
  type EmbedOptions,
  type LlmAdapter,
} from './llm.types.js';

type TagsResponse = { models?: Array<{ name?: string; model?: string }> };

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new LlmUnavailableError(`${url} responded ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof LlmUnavailableError) throw err;
    // AbortError here is our own timer, not a network fault. Saying 'unreachable'
    // sends people hunting a connectivity problem that does not exist.
    const timedOut = err instanceof Error && err.name === 'AbortError';
    throw new LlmUnavailableError(
      timedOut ? `${url} timed out after ${timeoutMs}ms` : `${url} unreachable`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }
}

export class OllamaAdapter implements LlmAdapter {
  private readonly genBreaker = new CircuitBreaker(
    'ollama.generate',
    config.ollama.circuitThreshold,
    config.ollama.circuitResetMs,
  );
  private readonly embedBreaker = new CircuitBreaker(
    'ollama.embed',
    config.ollama.circuitThreshold,
    config.ollama.circuitResetMs,
  );

  private tagsCache: { at: number; tags: Set<string> } | null = null;

  constructor(private readonly baseUrl: string = config.ollama.baseUrl) {}

  async availableModels(): Promise<Set<string>> {
    const now = Date.now();
    if (this.tagsCache && now - this.tagsCache.at < config.ollama.probeTtlMs) {
      return this.tagsCache.tags;
    }
    try {
      const body = await fetchJson<TagsResponse>(
        `${this.baseUrl}/api/tags`,
        { method: 'GET' },
        Math.min(config.ollama.embedTimeoutMs, 5_000),
      );
      const tags = new Set<string>();
      for (const m of body.models ?? []) {
        const name = m.name ?? m.model;
        if (!name) continue;
        tags.add(name);
        tags.add(name.split(':')[0] ?? name);
      }
      this.tagsCache = { at: now, tags };
      return tags;
    } catch {
      this.tagsCache = { at: now, tags: new Set() };
      return this.tagsCache.tags;
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (this.genBreaker.isOpen) {
      throw new LlmUnavailableError('ollama generation circuit is open');
    }

    const started = Date.now();
    const maxGenerationAttempts = config.ollama.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxGenerationAttempts; attempt += 1) {
      try {
        const body = await fetchJson<{ response?: string }>(
          `${this.baseUrl}/api/generate`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: req.model,
              system: req.system,
              prompt: req.prompt,
              stream: false,
              options: {
                temperature: req.temperature ?? 0.1,
                num_predict: 512,
                ...(req.stop ? { stop: req.stop } : {}),
              },
            }),
          },
          config.ollama.generateTimeoutMs,
        );
        this.genBreaker.recordSuccess();
        return {
          text: body.response ?? '',
          model: req.model,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        lastError = err;
        if (attempt === maxGenerationAttempts - 1) break;
      }
    }

    this.genBreaker.recordFailure();
    throw new LlmUnavailableError(
      `ollama generation failed for ${req.model}`,
      lastError,
    );
  }

  async embed(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.embedBreaker.isOpen) {
      throw new LlmUnavailableError('ollama embedding circuit is open');
    }

    try {
      const out: number[][] = [];
      for (const text of texts) {
        const body = await fetchJson<{ embedding?: number[] }>(
          `${this.baseUrl}/api/embeddings`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: config.ollama.embedModel, prompt: text }),
          },
          opts.timeoutMs ?? config.ollama.embedTimeoutMs,
        );
        if (!body.embedding || body.embedding.length === 0) {
          throw new LlmUnavailableError('ollama returned an empty embedding');
        }
        out.push(body.embedding);
      }
      this.embedBreaker.recordSuccess();
      return out;
    } catch (err) {
      this.embedBreaker.recordFailure();
      throw err instanceof LlmUnavailableError
        ? err
        : new LlmUnavailableError('ollama embedding failed', err);
    }
  }

  async health(): Promise<{ generation: DependencyStatus; embedding: DependencyStatus }> {
    const started = Date.now();
    const tags = await this.availableModels();
    const latencyMs = Date.now() - started;

    const missing = config.models.filter((m: ModelArm) => !tags.has(m));
    const generation: DependencyStatus = tags.size === 0
      ? { name: 'ollama.generation', status: 'degraded', detail: 'runtime unreachable', latencyMs }
      : missing.length === config.models.length
        ? { name: 'ollama.generation', status: 'degraded', detail: 'no expected model tags present', latencyMs }
        : missing.length > 0
          ? {
              name: 'ollama.generation',
              status: 'degraded',
              detail: `missing model tags: ${missing.join(', ')}`,
              latencyMs,
            }
          : { name: 'ollama.generation', status: 'up', latencyMs };

    const embedding: DependencyStatus = tags.has(config.ollama.embedModel)
      ? { name: 'ollama.embedding', status: 'up', latencyMs }
      : {
          name: 'ollama.embedding',
          status: 'degraded',
          detail: `missing embedding model tag: ${config.ollama.embedModel}`,
          latencyMs,
        };

    recordDependency(generation.name, generation.status);
    recordDependency(embedding.name, embedding.status);
    logEvent(logger, 'debug', 'dep.probe', {
      dependency: 'ollama',
      tags: tags.size,
      generation: generation.status,
      embedding: embedding.status,
    });

    return { generation, embedding };
  }
}
