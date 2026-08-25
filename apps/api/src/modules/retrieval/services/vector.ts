import fs from 'node:fs';
import path from 'node:path';
import { config } from '@/config.js';
import { logEvent, logger } from '@/utils/index.js';
import { recordDependency, retrievalHits } from '@/utils/index.js';
import type { DependencyStatus, Evidence, QueryContext, Retriever } from '@/types.js';
import type { Embedder } from '@/connections/index.js';
import { tokenize } from './bm25.js';
import { chunkMarkdown, type Chunk } from './chunker.js';

type IndexedChunk = Chunk & { vector: number[] };

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function loadCorpus(docsDir: string = config.docsDir): Chunk[] {
  if (!fs.existsSync(docsDir)) return [];
  const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md')).sort();
  const chunks: Chunk[] = [];
  for (const file of files) {
    const docId = path.basename(file, '.md');
    chunks.push(...chunkMarkdown(docId, fs.readFileSync(path.join(docsDir, file), 'utf8')));
  }
  return chunks;
}

export class VectorRetriever implements Retriever {
  readonly name = 'vector' as const;
  private index: IndexedChunk[] = [];
  private lastError: string | null = null;

  constructor(
    private readonly embedder: Embedder,
    private readonly docsDir: string = config.docsDir,
  ) {}

  get size(): number {
    return this.index.length;
  }

  async build(): Promise<{ indexed: number; error?: string }> {
    const chunks = loadCorpus(this.docsDir);
    if (chunks.length === 0) {
      this.lastError = 'corpus is empty';
      logEvent(logger, 'warn', 'boot.indexed', { chunks: 0, error: this.lastError });
      return { indexed: 0, error: this.lastError };
    }

    try {
      const vectors = await this.embedder.embed(chunks.map((c) => c.text), {
        timeoutMs: config.ollama.indexTimeoutMs,
      });
      this.index = chunks.map((c, i) => ({ ...c, vector: vectors[i] ?? [] }));
      this.lastError = null;
      logEvent(logger, 'info', 'boot.indexed', {
        chunks: this.index.length,
        docs: new Set(chunks.map((c) => c.docId)).size,
        dims: this.index[0]?.vector.length ?? 0,
      });
      return { indexed: this.index.length };
    } catch (err) {
      this.index = [];
      this.lastError = err instanceof Error ? err.message : String(err);
      logEvent(logger, 'warn', 'boot.indexed', { chunks: 0, error: this.lastError });
      return { indexed: 0, error: this.lastError };
    }
  }

  async retrieve(query: string, ctx: QueryContext): Promise<Evidence[]> {
    if (this.index.length === 0) {
      retrievalHits.observe({ path: this.name }, 0);
      return [];
    }

    let queryVector: number[];
    try {
      const [vec] = await this.embedder.embed([query]);
      if (!vec) throw new Error('empty query embedding');
      queryVector = vec;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      retrievalHits.observe({ path: this.name }, 0);
      logEvent(logger, 'warn', 'retrieval.floor_miss', {
        path: this.name,
        reason: 'query_embedding_failed',
        transaction_id: ctx.transactionId,
      });
      return [];
    }

    const scored = this.index
      .map((chunk) => ({ chunk, score: cosine(queryVector, chunk.vector) }))
      .sort((a, b) => b.score - a.score);

    const queryTerms = new Set(tokenize(query));
    const coverageOf = (text: string): number => {
      if (queryTerms.size === 0) return 1;
      const chunkTerms = new Set(tokenize(text));
      let matched = 0;
      for (const term of queryTerms) if (chunkTerms.has(term)) matched += 1;
      return matched / queryTerms.size;
    };

    const aboveSimilarityFloor = scored
      .filter(
        (hit) =>
          hit.score >= config.retrieval.vectorFloor &&
          (hit.score >= config.retrieval.vectorStrongScore ||
            coverageOf(hit.chunk.text) >= config.retrieval.vectorCoverage),
      )
      .slice(0, config.retrieval.topK);

    retrievalHits.observe({ path: this.name }, aboveSimilarityFloor.length);
    if (aboveSimilarityFloor.length === 0) {
      logEvent(logger, 'info', 'retrieval.floor_miss', {
        path: this.name,
        top_score: Number((scored[0]?.score ?? 0).toFixed(4)),
        top_coverage: Number(coverageOf(scored[0]?.chunk.text ?? '').toFixed(4)),
        floor: config.retrieval.vectorFloor,
        coverage_floor: config.retrieval.vectorCoverage,
      });
      return [];
    }

    return aboveSimilarityFloor.map(({ chunk, score }) => ({
      id: chunk.id,
      source: 'vector' as const,
      text: chunk.text,
      score: Number(score.toFixed(4)),
      meta: { docId: chunk.docId, heading: chunk.heading },
    }));
  }

  async health(): Promise<DependencyStatus> {
    const status: DependencyStatus =
      this.index.length > 0
        ? { name: 'vector_index', status: 'up', detail: `${this.index.length} chunks indexed` }
        : {
            name: 'vector_index',
            status: 'degraded',
            detail: this.lastError ?? 'index is empty',
          };
    recordDependency(status.name, status.status);
    return status;
  }
}
