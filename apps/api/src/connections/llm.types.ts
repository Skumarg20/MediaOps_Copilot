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

export type EmbedOptions = {
	timeoutMs?: number;
};


export interface Generator {
	generate(req: GenerateRequest): Promise<GenerateResult>;
	availableModels(): Promise<Set<string>>;
	generationHealth(): Promise<DependencyStatus>;
}

export interface Embedder {
	embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>;
	embeddingHealth(): Promise<DependencyStatus>;
}

export type LlmAdapter = Generator & Embedder;

export class LlmUnavailableError extends Error {
	constructor(
		message: string,
		override readonly cause?: unknown
	) {
		super(message);
		this.name = 'LlmUnavailableError';
	}
}
