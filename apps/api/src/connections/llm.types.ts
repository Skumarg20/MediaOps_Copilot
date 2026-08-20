import type { DependencyStatus, ModelArm } from '@/types.js';

export type GenerateRequest = {
  model: ModelArm;
  system: string;
  prompt: string;
  temperature?: number;
  stop?: string[];
};

export type GenerateResult = {
  text: string;
  model: ModelArm;
  latencyMs: number;
};

/**
 * The seam between the agent and the model runtime. Everything downstream of a
 * generation treats the runtime as untrusted and possibly absent, so this
 * interface is allowed to throw — callers must have a degraded path. It is also
 * what makes the local/hosted choice a composition detail rather than a rewrite.
 */
export interface LlmAdapter {
  generate(req: GenerateRequest): Promise<GenerateResult>;
  embed(texts: string[]): Promise<number[][]>;
  availableModels(): Promise<Set<string>>;
  health(): Promise<{ generation: DependencyStatus; embedding: DependencyStatus }>;
}

export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}
