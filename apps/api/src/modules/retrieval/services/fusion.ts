import { tokenize } from '@/utils/index.js';


export interface RankedList {
	source: string;
	ids: string[];
	weight?: number;
}

export interface FusedHit {
	id: string;
	score: number;
	contributions: Array<{ source: string; rank: number }>;
}

export const DEFAULT_RRF_K = 60;

export function reciprocalRankFusion(lists: RankedList[], k: number = DEFAULT_RRF_K): FusedHit[] {
	const scores = new Map<string, FusedHit>();

	for (const list of lists) {
		const weight = list.weight ?? 1;
		list.ids.forEach((id, index) => {
			const rank = index + 1;
			const existing = scores.get(id);
			const increment = weight / (k + rank);
			if (existing) {
				existing.score += increment;
				existing.contributions.push({ source: list.source, rank });
			} else {
				scores.set(id, { id, score: increment, contributions: [{ source: list.source, rank }] });
			}
		});
	}

	return [...scores.values()]
		.map((hit) => ({ ...hit, score: Number(hit.score.toFixed(6)) }))
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function termSet(text: string): Set<string> {
	return new Set(tokenize(text));
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	for (const term of a) if (b.has(term)) shared += 1;
	return shared / (a.size + b.size - shared);
}

export interface MmrCandidate {
	id: string;
	score: number;
	text: string;
}

export function mmrSelect(candidates: MmrCandidate[], opts: { lambda?: number; topK: number }): MmrCandidate[] {
	const lambda = opts.lambda ?? 0.7;
	if (candidates.length <= 1 || opts.topK <= 1) return candidates.slice(0, opts.topK);

	const terms = new Map(candidates.map((candidate) => [candidate.id, termSet(candidate.text)]));
	const maxScore = Math.max(...candidates.map((candidate) => candidate.score), 1e-9);

	const remaining = [...candidates];
	const selected: MmrCandidate[] = [];

	while (selected.length < opts.topK && remaining.length > 0) {
		let bestIndex = 0;
		let bestValue = -Infinity;

		for (let index = 0; index < remaining.length; index += 1) {
			const candidate = remaining[index];
			if (!candidate) continue;
			const relevance = candidate.score / maxScore;
			let redundancy = 0;
			for (const chosen of selected) {
				redundancy = Math.max(
					redundancy,
					jaccard(terms.get(candidate.id) ?? new Set(), terms.get(chosen.id) ?? new Set())
				);
			}
			const value = lambda * relevance - (1 - lambda) * redundancy;
			if (value > bestValue) {
				bestValue = value;
				bestIndex = index;
			}
		}

		const [picked] = remaining.splice(bestIndex, 1);
		if (picked) selected.push(picked);
	}

	return selected;
}
