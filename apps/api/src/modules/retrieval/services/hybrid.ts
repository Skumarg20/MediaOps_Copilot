import { config } from '@/config.js';
import type { Embedder } from '@/connections/index.js';
import { hopDecay, type GraphNode, type Neo4jGraph } from '@/modules/graph/index.js';
import { logEvent, logger, recordDependency, retrievalHits, termCoverage, tokenize } from '@/utils/index.js';
import type { DependencyStatus, Evidence, QueryContext, Retriever } from '@/types.js';
import { Bm25Index, type Bm25Doc } from './bm25.js';
import { cosine } from './vector.js';
import { mmrSelect, reciprocalRankFusion, type RankedList } from './fusion.js';


type IndexedUnit = {
	id: string;
	text: string;
	type: string;
	meta: Record<string, unknown>;
	vector?: number[];
};

export class HybridRetriever implements Retriever {
	readonly name = 'hybrid' as const;
	private units: IndexedUnit[] = [];
	private nodeById = new Map<string, GraphNode>();
	private bm25 = new Bm25Index();
	private graph: Neo4jGraph | null = null;
	private embedded = false;
	private lastError: string | null = null;

	constructor(private readonly embedder: Embedder) {}

	get size(): number {
		return this.units.length;
	}

	get hasVectors(): boolean {
		return this.embedded;
	}

	get knowledgeGraph(): Neo4jGraph | null {
		return this.graph;
	}

	async build(graph: Neo4jGraph): Promise<{ units: number; embedded: boolean; error?: string }> {
		this.graph = graph;
		const allNodes = await graph.nodes();
		this.nodeById = new Map(allNodes.map((node) => [node.id, node]));
		this.units = allNodes.map((node) => ({
			id: node.id,
			text: node.text,
			type: node.type,
			meta: { kind: node.type, label: node.label, ...node.attrs }
		}));

		const docs: Bm25Doc[] = this.units.map((unit) => ({ id: unit.id, text: unit.text, meta: unit.meta }));
		this.bm25.build(docs);

		try {
			const vectors = await this.embedder.embed(
				this.units.map((unit) => unit.text),
				{ timeoutMs: config.ollama.indexTimeoutMs }
			);
			this.units.forEach((unit, index) => {
				unit.vector = vectors[index];
			});
			this.embedded = vectors.length === this.units.length && vectors.every((vector) => vector.length > 0);
			this.lastError = null;
		} catch (err) {
			this.embedded = false;
			this.lastError = err instanceof Error ? err.message : String(err);
		}

		logEvent(logger, 'info', 'boot.indexed', {
			path: this.name,
			units: this.units.length,
			nodes: graph.nodeCount,
			edges: graph.edgeCount,
			embedded: this.embedded,
			...(this.lastError ? { error: this.lastError } : {})
		});

		return {
			units: this.units.length,
			embedded: this.embedded,
			...(this.lastError ? { error: this.lastError } : {})
		};
	}

	async retrieve(query: string, ctx: QueryContext): Promise<Evidence[]> {
		const graph = this.graph;
		if (!graph || this.units.length === 0) {
			retrievalHits.observe({ path: this.name }, 0);
			return [];
		}

		const queryTerms = new Set(tokenize(query));
		const lists: RankedList[] = [];
		const seedScores = new Map<string, number>();
		const seedSources = new Map<string, Set<string>>();

		const admit = (id: string, source: string, score: number): void => {
			seedScores.set(id, Math.max(seedScores.get(id) ?? 0, score));
			const sources = seedSources.get(id);
			if (sources) sources.add(source);
			else seedSources.set(id, new Set([source]));
		};

		const anchorIds = [
			...ctx.anchors.jobIds.map((id) => `job:${id}`),
			...ctx.anchors.errorCodes.map((code) => `errorCode:${code}`)
		].filter((id) => graph.has(id));

		if (anchorIds.length > 0) {
			lists.push({ source: 'exact', ids: anchorIds, weight: 2 });
			for (const id of anchorIds) admit(id, 'exact', 1);
		}

		const lexicalPool = Math.max(config.retrieval.hybridTopK * 4, 12);
		const lexicalHits = this.bm25
			.search(query, lexicalPool)
			.filter((hit) => hit.score >= config.retrieval.bm25Floor && hit.coverage >= config.retrieval.bm25Coverage);

		if (lexicalHits.length > 0) {
			lists.push({ source: 'lexical', ids: lexicalHits.map((hit) => hit.id) });
			for (const hit of lexicalHits) admit(hit.id, 'lexical', Math.min(1, hit.score / 10));
		}

		let denseHits: Array<{ id: string; score: number }> = [];
		if (this.embedded) {
			try {
				const [queryVector] = await this.embedder.embed([query]);
				if (queryVector) {
					denseHits = this.units
						.filter((unit) => unit.vector && unit.vector.length > 0)
						.map((unit) => ({ id: unit.id, score: cosine(queryVector, unit.vector as number[]), text: unit.text }))
						.filter(
							(hit) =>
								hit.score >= config.retrieval.vectorFloor &&
								(hit.score >= config.retrieval.vectorStrongScore ||
									termCoverage(queryTerms, hit.text) >= config.retrieval.vectorCoverage)
						)
						.sort((a, b) => b.score - a.score)
						.slice(0, lexicalPool)
						.map((hit) => ({ id: hit.id, score: hit.score }));
				}
			} catch (err) {
				this.lastError = err instanceof Error ? err.message : String(err);
				logEvent(logger, 'warn', 'retrieval.floor_miss', {
					path: this.name,
					reason: 'query_embedding_failed',
					transaction_id: ctx.transactionId
				});
			}
		}

		if (denseHits.length > 0) {
			lists.push({ source: 'dense', ids: denseHits.map((hit) => hit.id) });
			for (const hit of denseHits) admit(hit.id, 'dense', hit.score);
		}

		if (anchorIds.length === 0) {
			const typeSeeds = this.seedsFromNamedTypes(graph, queryTerms);
			if (typeSeeds.length > 0) {
				lists.push({ source: 'type', ids: typeSeeds, weight: 0.5 });
				for (const id of typeSeeds) admit(id, 'type', 0.3);
			}
		}

		if (seedScores.size === 0) {
			retrievalHits.observe({ path: this.name }, 0);
			logEvent(logger, 'info', 'retrieval.floor_miss', {
				path: this.name,
				mode: 'fused',
				anchors: anchorIds.length,
				lexical_candidates: lexicalHits.length,
				dense_candidates: denseHits.length
			});
			return [];
		}

		const fused = reciprocalRankFusion(lists, config.retrieval.rrfK);
		const fusedById = new Map(fused.map((hit) => [hit.id, hit]));
		const topFusedScore = fused[0]?.score ?? 1;

		type Candidate = {
			id: string;
			text: string;
			score: number;
			hops: number;
			path: string[];
			via: string[];
			sources: string[];
		};

		const candidates = new Map<string, Candidate>();

		for (const hit of fused) {
			const node = this.nodeById.get(hit.id);
			if (!node) continue;
			candidates.set(hit.id, {
				id: hit.id,
				text: node.text,
				score: hit.score / topFusedScore,
				hops: 0,
				path: [hit.id],
				via: [],
				sources: [...(seedSources.get(hit.id) ?? [])]
			});
		}

		const seedIds = [...candidates.keys()].slice(0, config.retrieval.expansionSeeds);
		if (config.retrieval.graphMaxHops > 0 && seedIds.length > 0) {
			for (const seedId of seedIds) {
				const seed = candidates.get(seedId);
				if (!seed) continue;
				const reached = await graph.expand([seedId], { maxHops: config.retrieval.graphMaxHops, direction: 'both' });

				for (const entry of reached) {
					if (entry.hops === 0) continue;
					const decayed = seed.score * hopDecay(entry.hops) * config.retrieval.expansionDiscount;
					if (decayed <= 0) continue;

					const existing = candidates.get(entry.node.id);
					if (existing && (existing.hops === 0 || existing.score >= decayed)) continue;

					candidates.set(entry.node.id, {
						id: entry.node.id,
						text: entry.node.text,
						score: decayed,
						hops: entry.hops,
						path: entry.path,
						via: entry.via,
						sources: ['graph']
					});
				}
			}
		}

		const ranked = [...candidates.values()].sort(
			(a, b) => b.score - a.score || a.hops - b.hops || a.id.localeCompare(b.id)
		);
		const selected = mmrSelect(
			ranked.map((candidate) => ({ id: candidate.id, score: candidate.score, text: candidate.text })),
			{ lambda: config.retrieval.mmrLambda, topK: config.retrieval.hybridTopK }
		);

		const evidence: Evidence[] = selected.map((choice) => {
			const candidate = candidates.get(choice.id) as Candidate;
			const node = this.nodeById.get(choice.id);
			const fusedHit = fusedById.get(choice.id);

			return {
				id: candidate.id,
				source: 'hybrid' as const,
				text: candidate.text,
				score: Number(candidate.score.toFixed(4)),
				meta: {
					kind: node?.type ?? 'unknown',
					label: node?.label ?? candidate.id,
					...(node?.attrs ?? {}),
					retrievedBy: candidate.sources,
					hops: candidate.hops,
					...(candidate.hops > 0 ? { hopPath: candidate.path.join(' -> '), viaEdges: candidate.via } : {}),
					...(fusedHit ? { fusionRanks: fusedHit.contributions } : {}),
					exact: candidate.sources.includes('exact')
				}
			};
		});

		retrievalHits.observe({ path: this.name }, evidence.length);
		logEvent(logger, 'info', 'retrieval.completed', {
			path: this.name,
			mode: 'fused',
			hits: evidence.length,
			seeds: seedScores.size,
			expanded: evidence.filter((item) => Number(item.meta.hops ?? 0) > 0).length,
			top_score: evidence[0]?.score ?? null
		});

		return evidence;
	}

	private seedsFromNamedTypes(graph: Neo4jGraph, queryTerms: Set<string>): string[] {
		const out: string[] = [];

		for (const type of graph.nodeTypes()) {
			if (type === 'DocSection') continue;

			const key = type.toLowerCase();
			const named = queryTerms.has(key) || queryTerms.has(`${key}s`) || (key.endsWith('y') && queryTerms.has(`${key.slice(0, -1)}ies`));
			if (!named) continue;

			for (const node of this.units.filter((unit) => unit.type === type).slice(0, config.retrieval.hybridTopK)) out.push(node.id);
		}

		return out;
	}

	async health(): Promise<DependencyStatus> {
		const status: DependencyStatus = !this.graph
			? { name: 'hybrid_index', status: 'down', detail: 'graph has not been built' }
			: this.embedded
				? {
						name: 'hybrid_index',
						status: 'up',
						detail: `${this.units.length} units, ${this.graph.edgeCount} edges, dense + lexical`
					}
				: {
						name: 'hybrid_index',
						status: 'degraded',
						detail: `${this.units.length} units, lexical + graph only (${this.lastError ?? 'no embeddings'})`
					};

		recordDependency(status.name, status.status);
		return status;
	}
}
