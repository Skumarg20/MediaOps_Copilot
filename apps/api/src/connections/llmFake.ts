import { STOPWORDS } from '@/utils/index.js';
import type { DependencyStatus } from '@/types.js';
import type { GenerateRequest, GenerateResult, LlmAdapter } from './llm.types.js';
import { LlmUnavailableError } from './llm.types.js';

const CONCEPT_AXES: Record<string, string[]> = {
  performance: [
    'slow', 'slower', 'slowly', 'slowdown', 'usual', 'longer', 'long', 'duration',
    'elevated', 'degradation', 'degraded', 'latency', 'throughput', 'saturation',
    'saturated', 'stretch', 'stretches', 'extended', 'penalty', 'tail', 'concurrency',
    'bandwidth', 'backpressure', 'throttle', 'throttling', 'cache', 'cold', 'wait',
  ],
  timeouts: [
    'timeout', 'timeouts', 'timed', 'retry', 'retries', 'retrying', 'budget',
    'backoff', 'attempt', 'attempts', 'cancel', 'cancelling', 'transient',
    'deterministic', 'reaped', 'watchdog', 'exceeds', 'exceeded',
  ],
  lifecycle: [
    'queued', 'assigned', 'rendering', 'uploading', 'succeeded', 'failed', 'failure',
    'state', 'states', 'status', 'stuck', 'hang', 'hung', 'heartbeat', 'heartbeats',
    'lease', 'lifecycle', 'admission', 'shed', 'shedding', 'deferred', 'progress',
  ],
  architecture: [
    'scheduler', 'worker', 'workers', 'fleet', 'host', 'gpu', 'priority', 'tier',
    'tiers', 'storage', 'object', 'replica', 'singleton', 'assignment', 'queue',
    'depth', 'submitter', 'output', 'artefact', 'scratch', 'store', 'table',
  ],
  glossary: [
    'error', 'code', 'codes', 'meaning', 'means', 'severity', 'remediation',
    'define', 'definition', 'raised', 'reason',
  ],
  action: [
    'how', 'should', 'do', 'drain', 'restart', 'safely', 'safe', 'intervention',
    'manual', 'confirm', 'check', 'investigate', 'handle', 'fix', 'resolve',
  ],
};

const AXIS_NAMES = Object.keys(CONCEPT_AXES);
const TOKEN_TO_AXES = new Map<string, number[]>();
AXIS_NAMES.forEach((axis, i) => {
  for (const token of CONCEPT_AXES[axis] ?? []) {
    const existing = TOKEN_TO_AXES.get(token) ?? [];
    existing.push(i);
    TOKEN_TO_AXES.set(token, existing);
  }
});

const LEXICAL_BUCKETS = 48;
const DIMS = AXIS_NAMES.length + LEXICAL_BUCKETS;

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % LEXICAL_BUCKETS;
}

export function conceptEmbed(text: string): number[] {
  const vec = new Array(DIMS).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

  for (const token of tokens) {
    const axes = TOKEN_TO_AXES.get(token);
    if (axes) {
      for (const axis of axes) vec[axis] += 3;
    }
    vec[AXIS_NAMES.length + hashToken(token)] += 1;
  }

  const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

export type FakeOptions = {
  generationDown?: boolean;
  embeddingDown?: boolean;
  scripted?: (req: GenerateRequest) => string;
};

function parseEvidenceIds(prompt: string): string[] {
  const ids: string[] = [];
  const re = /^\[([^\]\n]+)\]/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(prompt)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  return ids;
}

function parseEvidenceBlocks(prompt: string): Array<{ id: string; text: string }> {
  const blocks: Array<{ id: string; text: string }> = [];
  const re = /^\[([^\]\n]+)\]\s*([\s\S]*?)(?=^\[|\n*$)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(prompt)) !== null) {
    if (match[1]) blocks.push({ id: match[1], text: (match[2] ?? '').trim() });
  }
  return blocks;
}

export class FakeLlmAdapter implements LlmAdapter {
  readonly calls: GenerateRequest[] = [];

  constructor(private readonly opts: FakeOptions = {}) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls.push(req);
    if (this.opts.generationDown) {
      throw new LlmUnavailableError('fake: generation runtime unreachable');
    }

    const text = this.opts.scripted
      ? this.opts.scripted(req)
      : this.defaultAnswer(req.prompt);

    return { text, model: req.model, latencyMs: 5 };
  }

  private defaultAnswer(prompt: string): string {
    const blocks = parseEvidenceBlocks(prompt).slice(0, 2);
    if (blocks.length === 0) {
      return 'Thought: The evidence block is empty.\nAction: final_answer\nAnswer: I don\'t know\nCitations: ';
    }
    const body = blocks
      .map((b) => {
        const sentence = b.text.split(/(?<=\.)\s/).slice(0, 2).join(' ').trim();
        return `${sentence} [${b.id}]`;
      })
      .join(' ');
    const ids = blocks.map((b) => b.id).join(', ');
    return `Thought: The evidence covers the question.\nAction: final_answer\nAnswer: ${body}\nCitations: ${ids}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.opts.embeddingDown) {
      throw new LlmUnavailableError('fake: embedding runtime unreachable');
    }
    return texts.map(conceptEmbed);
  }

  async availableModels(): Promise<Set<string>> {
    if (this.opts.generationDown && this.opts.embeddingDown) return new Set();
    const tags = new Set<string>();
    if (!this.opts.generationDown) {
      tags.add('llama3.2:3b');
      tags.add('qwen2.5:3b');
    }
    if (!this.opts.embeddingDown) tags.add('nomic-embed-text');
    return tags;
  }

  async generationHealth(): Promise<DependencyStatus> {
    return {
      name: 'ollama.generation',
      status: this.opts.generationDown ? 'degraded' : 'up',
      detail: this.opts.generationDown ? 'fake: runtime down' : undefined,
    };
  }

  async embeddingHealth(): Promise<DependencyStatus> {
    return {
      name: 'ollama.embedding',
      status: this.opts.embeddingDown ? 'degraded' : 'up',
      detail: this.opts.embeddingDown ? 'fake: embedding down' : undefined,
    };
  }
}

export { parseEvidenceIds };
