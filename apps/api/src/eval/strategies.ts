import type { PinDecision } from '@/modules/routing/index.js';
import type { RetrievalPath } from '@/types.js';

export type StrategyName =
	| 'routed'
	| 'always_vector'
	| 'always_vectorless'
	| 'always_hybrid'
	| 'random'
	| 'adversarial_gated'
	| 'adversarial_ungated';

export type ModelBehaviour = 'faithful' | 'adversarial';

export interface Strategy {
	name: StrategyName;
	label: string;
	description: string;
	choosePath(pin: PinDecision, rng: () => number): RetrievalPath;
	fallback: boolean;
	gate: boolean;
	behaviour: ModelBehaviour;
}

export const STRATEGIES: Strategy[] = [
	{
		name: 'routed',
		label: 'Routed (this system)',
		description:
			'Deterministic pin when an anchor resolves, semantic path otherwise, with the vector to vectorless fallback and the grounding gate active.',
		choosePath: (pin) => pin.path ?? 'vector',
		fallback: true,
		gate: true,
		behaviour: 'faithful'
	},
	{
		name: 'always_vector',
		label: 'Always vector',
		description: 'Every query treated as semantic RAG. The naive baseline.',
		choosePath: () => 'vector',
		fallback: false,
		gate: true,
		behaviour: 'faithful'
	},
	{
		name: 'always_vectorless',
		label: 'Always vectorless',
		description: 'Every query treated as a keyword or record lookup.',
		choosePath: () => 'vectorless',
		fallback: false,
		gate: true,
		behaviour: 'faithful'
	},
	{
		name: 'always_hybrid',
		label: 'Always fused',
		description:
			'Every query through the fused path: exact anchors, lexical and dense over one unit set, rank-fused, then expanded along the graph. Shows what routing is still worth once one path covers everything.',
		choosePath: () => 'hybrid',
		fallback: false,
		gate: true,
		behaviour: 'faithful'
	},
	{
		name: 'random',
		label: 'Random path',
		description: 'Seeded coin flip. Establishes what path choice is worth at all.',
		choosePath: (_pin, rng) => (rng() < 0.5 ? 'vector' : 'vectorless'),
		fallback: false,
		gate: true,
		behaviour: 'faithful'
	},
	{
		name: 'adversarial_gated',
		label: 'Fabricating model, gate on',
		description:
			'Routing and retrieval unchanged, but the model fabricates a citation and paraphrases clear of the evidence. The gate is active.',
		choosePath: (pin) => pin.path ?? 'vector',
		fallback: true,
		gate: true,
		behaviour: 'adversarial'
	},
	{
		name: 'adversarial_ungated',
		label: 'Fabricating model, gate off',
		description:
			'The same fabricating model with the grounding gate disabled. The difference between this row and the one above it is what the gate is worth.',
		choosePath: (pin) => pin.path ?? 'vector',
		fallback: true,
		gate: false,
		behaviour: 'adversarial'
	}
];

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
