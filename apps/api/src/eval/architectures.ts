import { conceptEmbed } from '@/connections/llmFake.js';
import {
	Neo4jGraph,
	hopDecay,
	runOperator,
	type NodeType,
	type OperatorResult
} from '@/modules/graph/index.js';
import { Bm25Index, cosine, mmrSelect, reciprocalRankFusion } from '@/modules/retrieval/index.js';
import { tokenize } from '@/utils/index.js';
import type { GraphNode } from '@/modules/graph/index.js';
import type { BenchQuery } from './structuralQueries.js';


export interface BenchEnv {
	domain: string;
	graph: Neo4jGraph;
	bm25: Bm25Index;
	vectors: Map<string, number[]>;
	nodes: GraphNode[];
	nodeById: Map<string, GraphNode>;
	topK: number;
	asOf: string;
}

export interface ArchitectureRun {
	ids: string[];
	top: string | null;
	calls: string[];
	abstained: boolean;
}

export interface Architecture {
	name: string;
	label: string;
	origin: 'paper' | 'vendor' | 'this repo';
	description: string;
	run(env: BenchEnv, query: BenchQuery): Promise<ArchitectureRun>;
}


export async function buildEnv(domain: string, graph: Neo4jGraph, asOf: string, topK = 6): Promise<BenchEnv> {
	const nodes = await graph.nodes();
	const bm25 = new Bm25Index(nodes.map((node) => ({ id: node.id, text: node.text, meta: { type: node.type } })));
	const vectors = new Map<string, number[]>(nodes.map((node) => [node.id, conceptEmbed(node.text)]));
	const nodeById = new Map<string, GraphNode>(nodes.map((node) => [node.id, node]));
	return { domain, graph, bm25, vectors, nodes, nodeById, topK, asOf };
}

function lexicalIds(env: BenchEnv, query: string, limit = env.topK): string[] {
	return env.bm25.search(query, limit).map((hit) => hit.id);
}

function denseIds(env: BenchEnv, query: string, limit = env.topK): string[] {
	const queryVector = conceptEmbed(query);
	return [...env.vectors.entries()]
		.map(([id, vector]) => ({ id, score: cosine(queryVector, vector) }))
		.filter((hit) => hit.score > 0)
		.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
		.slice(0, limit)
		.map((hit) => hit.id);
}

async function admittedSeeds(env: BenchEnv, query: string): Promise<string[]> {
	const terms = new Set(tokenize(query));
	const lexical = env.bm25
		.search(query, env.topK * 4)
		.filter((hit) => hit.score >= 1.2 && hit.coverage >= 0.5)
		.map((hit) => hit.id);

	const queryVector = conceptEmbed(query);
	const dense = [...env.vectors.entries()]
		.map(([id, vector]) => ({ id, score: cosine(queryVector, vector) }))
		.filter((hit) => {
			if (hit.score < 0.45) return false;
			if (hit.score >= 0.7) return true;
			const node = env.nodeById.get(hit.id);
			if (!node) return false;
			const nodeTerms = new Set(tokenize(node.text));
			let matched = 0;
			for (const term of terms) if (nodeTerms.has(term)) matched += 1;
			return terms.size > 0 && matched / terms.size >= 0.4;
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, env.topK * 4)
		.map((hit) => hit.id);

	const anchors = resolveEntities(env.nodes, env.graph, query);

	const typeSeeds =
		anchors.length > 0
			? []
			: env.graph
					.nodeTypes()
					.filter((type) => type !== 'DocSection' && (terms.has(type.toLowerCase()) || terms.has(`${type.toLowerCase()}s`)))
					.flatMap((type) => env.nodes.filter((entry) => entry.type === type).slice(0, env.topK).map((node) => node.id));

	if (anchors.length === 0 && lexical.length === 0 && dense.length === 0 && typeSeeds.length === 0) return [];

	const fused = reciprocalRankFusion(
		[
			{ source: 'exact', ids: anchors, weight: 2 },
			{ source: 'lexical', ids: lexical },
			{ source: 'dense', ids: dense },
			{ source: 'type', ids: typeSeeds, weight: 0.5 }
		].filter((list) => list.ids.length > 0)
	);

	return fused.map((hit) => hit.id);
}

export function resolveEntities(nodes: GraphNode[], graph: Neo4jGraph, query: string): string[] {
	const haystack = query.toLowerCase();
	const normalised = haystack.replace(/[\s-]+/g, '_');
	const queryWords = new Set(tokenize(query));
	const found = new Set<string>();

	const isNamedEntity = (node: { attrs: Record<string, unknown> }): boolean =>
		typeof node.attrs.code === 'string' || typeof node.attrs.name === 'string';

	const typeWords = new Set(graph.nodeTypes().flatMap((type) => [typeKey(type), `${typeKey(type)}s`]));

	const wordOwners = new Map<string, Set<string>>();
	for (const node of nodes) {
		if (!isNamedEntity(node)) continue;
		for (const word of node.label.toLowerCase().split(/[^a-z0-9]+/)) {
			if (word.length < 5 || typeWords.has(word) || typeWords.has(typeKey(word))) continue;
			const owners = wordOwners.get(word);
			if (owners) owners.add(node.id);
			else wordOwners.set(word, new Set([node.id]));
		}
	}

	for (const node of nodes) {
		const code = typeof node.attrs.code === 'string' ? node.attrs.code.toLowerCase() : null;
		const label = node.label.toLowerCase();
		const bare = node.id.split(':').slice(1).join(':').toLowerCase();

		if (code && (haystack.includes(code) || normalised.includes(code.replace(/[\s-]+/g, '_')))) {
			found.add(node.id);
			continue;
		}
		if (label.includes(' ') && haystack.includes(label)) {
			found.add(node.id);
			continue;
		}
		if (bare.length >= 3 && new RegExp(`\\b${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack)) {
			found.add(node.id);
			continue;
		}
		if (!isNamedEntity(node)) continue;
		for (const word of label.split(/[^a-z0-9]+/)) {
			if (word.length < 5 || !queryWords.has(word)) continue;
			if (wordOwners.get(word)?.size === 1) {
				found.add(node.id);
				break;
			}
		}
	}

	return [...found].sort();
}


type PlanIntent =
	| 'aggregation'
	| 'absence'
	| 'degree'
	| 'comparison'
	| 'temporal'
	| 'what_if'
	| 'propagation'
	| 'multi_hop'
	| 'path'
	| 'centrality'
	| 'components'
	| 'linkage'
	| 'lookup'
	| 'prose';

const INTENT_RULES: Array<{ intent: PlanIntent; pattern: RegExp; needsTwoEntities?: boolean }> = [
	{ intent: 'what_if', pattern: /\b(what if|if [\w -]+ (?:is|are|were) (?:dropped|drained|removed|lost|frozen|fails?)|drop(?:ped)?|drained|frozen)\b/i },
	{ intent: 'path', pattern: /\b(how (?:does|do|is|are)\b[^?]*\b(?:get|travel|reach|move|connected)|route from|path from|connected to)\b/i, needsTwoEntities: true },
	{ intent: 'centrality', pattern: /\b(bottleneck|chokepoint|most central|most influential|most important|hub of the)\b/i },
	{ intent: 'components', pattern: /\b(isolated|cut off|disconnected|closed group|no link to the rest|largest connected|fragment)\b/i },
	{ intent: 'degree', pattern: /\b(only one|exactly one|just one|single|sole|no alternative)\b/i },
	{ intent: 'propagation', pattern: /\b(rank .* by exposure|by exposure|blast radius|exposure to)\b/i },
	{ intent: 'absence', pattern: /\b(?:have|has) no\b|\bwhich\b[^?]*\b(?:not|no|without|lack(?:s|ing)?|uncovered)\b/i },
	{ intent: 'aggregation', pattern: /\b(how many|most|fewest|count|total|rank|highest|lowest|busiest|top \d+)\b/i },
	{ intent: 'comparison', pattern: /\b(compare|comparison|versus|vs\.?|difference between|same .* as)\b/i },
	{ intent: 'temporal', pattern: /\b(now|currently|as of|after|before|since|latest|on or after)\b/i },
	{ intent: 'multi_hop', pattern: /\b(exposed to|affected by|caused by|how do i fix|because of|same reason as)\b/i }
];

export function classifyIntent(
	query: string,
	hasEntity: boolean,
	entityCount = hasEntity ? 1 : 0,
	namedTypeCount = 0
): PlanIntent {
	for (const rule of INTENT_RULES) {
		if (rule.needsTwoEntities && entityCount < 2) continue;
		if (rule.pattern.test(query)) return rule.intent;
	}
	if (hasEntity) return 'lookup';
	return namedTypeCount >= 2 ? 'linkage' : 'prose';
}

function typeProfiles(nodes: GraphNode[], graph: Neo4jGraph): Map<NodeType, Set<string>> {
	const profiles = new Map<NodeType, Set<string>>();
	for (const type of graph.nodeTypes()) {
		const terms = new Set<string>(tokenize(type));
		for (const node of nodes.filter((entry) => entry.type === type).slice(0, 40)) {
			for (const term of tokenize(`${node.label} ${Object.values(node.attrs).join(' ')}`)) terms.add(term);
		}
		profiles.set(type, terms);
	}
	return profiles;
}

function bestType(
	nodes: GraphNode[],
	graph: Neo4jGraph,
	terms: string[],
	opts: { exclude?: NodeType[]; only?: NodeType[] } = {}
): NodeType | null {
	const profiles = typeProfiles(nodes, graph);
	let best: { type: NodeType; score: number } | null = null;

	for (const [type, profile] of profiles) {
		if (opts.exclude?.includes(type)) continue;
		if (opts.only && !opts.only.includes(type)) continue;
		let score = 0;
		for (const term of terms) {
			if (profile.has(term)) score += 1;
			if (typeKey(term) === typeKey(type)) score += 4;
		}
		if (score > 0 && (!best || score > best.score)) best = { type, score };
	}

	return best?.type ?? null;
}

function namedTypes(graph: Neo4jGraph, query: string): NodeType[] {
	const words = tokenize(query);
	const types = graph.nodeTypes().filter((type) => type !== 'DocSection');
	const seen = new Set<NodeType>();
	const out: NodeType[] = [];

	for (let index = 0; index < words.length; index += 1) {
		for (let span = Math.min(3, words.length - index); span >= 1; span -= 1) {
			const candidate = typeKey(words.slice(index, index + span).join(''));
			const match = types.find((type) => typeKey(type) === candidate);
			if (!match || seen.has(match)) continue;
			seen.add(match);
			out.push(match);
			break;
		}
	}

	return out;
}

function schemaDistance(graph: Neo4jGraph, from: NodeType, to: NodeType): number {
	if (from === to) return 0;
	const seen = new Set<NodeType>([from]);
	let frontier: NodeType[] = [from];

	for (let hop = 1; hop <= graph.nodeTypes().length; hop += 1) {
		const next: NodeType[] = [];
		for (const type of frontier) {
			for (const neighbour of graph.adjacentTypes(type)) {
				if (seen.has(neighbour)) continue;
				if (neighbour === to) return hop;
				seen.add(neighbour);
				next.push(neighbour);
			}
		}
		if (next.length === 0) break;
		frontier = next;
	}

	return 1;
}

function typeKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
}

function subjectType(graph: Neo4jGraph, query: string): NodeType | null {
	const match = /\b(?:which|what|how many|rank|list|show)\s+([a-z][a-z\s-]{0,40})/i.exec(query);
	if (!match?.[1]) return null;

	const words = match[1].trim().split(/[\s-]+/).slice(0, 3);
	const types = graph.nodeTypes();

	for (let span = Math.min(3, words.length); span >= 1; span -= 1) {
		const candidate = typeKey(words.slice(0, span).join(''));
		if (candidate.length === 0) continue;
		for (const type of types) {
			if (typeKey(type) === candidate) return type;
		}
	}

	return null;
}

function attributeFilter(query: string): string {
	const terms = new Set(tokenize(query));
	const has = (...words: string[]): boolean => words.some((word) => terms.has(word));

	if (has('failures', 'failure', 'failed', 'failing')) return 'status=failed';
	if (has('returned', 'refunded', 'returns')) return 'returnedOrRefunded=true';
	if (has('delayed', 'delays', 'late')) return 'delayed=true';
	return '';
}

function namedEdgeTypes(graph: Neo4jGraph, query: string): string[] {
	const terms = new Set(tokenize(query));
	return graph.schema.edgeTypes
		.map((spec) => spec.name)
		.filter((name) =>
			name
				.toLowerCase()
				.split('_')
				.some((part) => part.length > 2 && (terms.has(part) || terms.has(`${part}s`)))
		);
}

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

export interface PlannedCall {
	operator: string;
	args: Record<string, unknown>;
}

const ANSWER_OPERATORS = new Set([
	'set_complement',
	'aggregate_over_type',
	'simulate_removal',
	'propagate_risk',
	'subgraph_diff',
	'betweenness',
	'pagerank',
	'connected_components',
	'shortest_path',
	'filter_edges_by_date'
]);

const COUNTING_OPERATORS = new Set(['count_edges', 'aggregate_over_type']);

export function planOperators(
	env: BenchEnv,
	query: string,
	opts: { allowComputation: boolean; stepBudget: number }
): PlannedCall[] {
	const { graph } = env;
	const entities = resolveEntities(env.nodes, graph, query);
	const linkedTypes = namedTypes(graph, query);
	const intent = classifyIntent(query, entities.length > 0, entities.length, linkedTypes.length);
	const terms = tokenize(query);
	const root = subjectType(graph, query);
	const target = root
		? (bestType(env.nodes, graph, terms, { only: graph.adjacentTypes(root), exclude: [root] }) ??
			bestType(env.nodes, graph, terms, { exclude: [root] }))
		: bestType(env.nodes, graph, terms);
	const where = attributeFilter(query);
	const calls: PlannedCall[] = [];

	const iterate = (type: NodeType, edgeTypes?: string[]): void => {
		for (const node of env.nodes.filter((entry) => entry.type === type).slice(0, opts.stepBudget)) {
			calls.push({
				operator: 'count_edges',
				args: { id: node.id, direction: 'both', ...(edgeTypes && edgeTypes.length > 0 ? { edgeTypes: edgeTypes.join(',') } : {}) }
			});
		}
	};

	switch (intent) {
		case 'aggregation':
			if (entities.length > 0) {
				calls.push({ operator: 'get_neighbors', args: { id: entities[0] as string, direction: 'both', asOf: env.asOf } });
			} else if (opts.allowComputation && root && target) {
				calls.push({
					operator: 'aggregate_over_type',
					args: {
						rootType: root,
						targetType: target,
						...(where ? { where } : {}),
						direction: 'both',
						maxHops: schemaDistance(graph, root, target)
					}
				});
			} else if (root) {
				iterate(root, target ? graph.edgeTypesBetween(root, target) : undefined);
			}
			break;

		case 'linkage': {
			const subject = linkedTypes[0];
			const other = linkedTypes.length > 1 ? linkedTypes[linkedTypes.length - 1] : undefined;
			if (opts.allowComputation && subject && other) {
				calls.push({
					operator: 'aggregate_over_type',
					args: {
						rootType: subject,
						targetType: other,
						...(where ? { where } : {}),
						direction: 'both',
						maxHops: schemaDistance(graph, subject, other)
					}
				});
			} else if (subject) {
				iterate(subject, other ? graph.edgeTypesBetween(subject, other) : undefined);
			}
			break;
		}

		case 'degree': {
			const scanType = root ?? target;
			if (scanType) {
				const edgeTypes = target && target !== scanType ? graph.edgeTypesBetween(scanType, target) : undefined;
				calls.push({ operator: 'find_nodes', args: { type: scanType } });
				iterate(scanType, edgeTypes);
			}
			break;
		}

		case 'absence': {
			const scanType = root ?? target;
			const relatedType = scanType
				? (linkedTypes.find((type) => type !== scanType) ??
					bestType(env.nodes, graph, terms, { only: graph.adjacentTypes(scanType), exclude: [scanType] }))
				: null;
			if (scanType) {
				const edgeTypes = relatedType ? graph.edgeTypesBetween(scanType, relatedType) : undefined;
				if (opts.allowComputation && relatedType) {
					calls.push({
						operator: 'aggregate_over_type',
						args: {
							rootType: scanType,
							targetType: relatedType,
							...(edgeTypes && edgeTypes.length > 0 ? { edgeTypes: edgeTypes.join(',') } : {}),
							direction: 'both',
							maxHops: schemaDistance(graph, scanType, relatedType)
						}
					});
				} else {
					iterate(scanType, edgeTypes);
				}
				calls.push({ operator: 'set_complement', args: { type: scanType, exclude: '' } });
			}
			break;
		}

		case 'comparison':
			if (entities.length >= 2 && opts.allowComputation) {
				calls.push({ operator: 'subgraph_diff', args: { left: entities[0], right: entities[1], maxHops: 3 } });
			} else {
				for (const entity of entities.slice(0, 2)) {
					calls.push({ operator: 'subgraph', args: { root: entity, maxHops: 2 } });
				}
			}
			break;

		case 'what_if': {
			const observed = root ?? target;
			if (entities.length > 0 && opts.allowComputation) {
				calls.push({
					operator: 'simulate_removal',
					args: { remove: entities[0], ...(observed ? { observeType: observed } : {}), direction: 'both', asOf: env.asOf }
				});
			} else {
				for (const entity of entities.slice(0, 2)) {
					calls.push({ operator: 'get_neighbors', args: { id: entity, direction: 'both' } });
				}
			}
			break;
		}

		case 'propagation': {
			const severityWord = /\b(critical|high|medium|low)\b/i.exec(query)?.[1]?.toLowerCase();
			const sources =
				entities.length > 0
					? entities
					: env.nodes
							.filter((node) => {
								const severity = typeof node.attrs.severity === 'string' ? node.attrs.severity.toLowerCase() : null;
								if (!severity) return false;
								return severityWord ? severity === severityWord : true;
							})
							.map((node) => node.id);

			if (sources.length > 0) {
				calls.push({
					operator: 'propagate_risk',
					args: {
						sources: sources.join(','),
						direction: 'both',
						maxHops: 4,
						...(root ? { targetType: root } : target ? { targetType: target } : {}),
						asOf: env.asOf
					}
				});
			}
			break;
		}

		case 'path': {
			const routeEdges = namedEdgeTypes(graph, query);
			calls.push({
				operator: 'shortest_path',
				args: {
					from: entities[0],
					to: entities[1],
					...(routeEdges.length > 0 ? { edgeTypes: routeEdges.join(',') } : {}),
					asOf: env.asOf
				}
			});
			break;
		}

		case 'centrality': {
			const operator = /\b(bottleneck|chokepoint)\b/i.test(query) ? 'betweenness' : 'pagerank';
			const scope = root ?? target;
			if (opts.allowComputation) {
				calls.push({ operator, args: { ...(scope ? { type: scope } : {}), top: 10 } });
			} else if (scope) {
				iterate(scope);
			}
			break;
		}

		case 'components': {
			const scope = root ?? target;
			const mode = /\b(largest connected|main network|main body)\b/i.test(query) ? 'largest' : 'isolated';
			if (opts.allowComputation) {
				calls.push({ operator: 'connected_components', args: { mode, ...(scope ? { type: scope } : {}) } });
			} else if (scope) {
				iterate(scope);
			}
			break;
		}

		case 'temporal': {
			const date = ISO_DATE.exec(query)?.[1];
			const edgeTypes = namedEdgeTypes(graph, query);

			if (entities.length === 0 && date) {
				calls.push({
					operator: 'filter_edges_by_date',
					args: { ...(edgeTypes.length > 0 ? { edgeTypes: edgeTypes.join(',') } : {}), from: date }
				});
				break;
			}

			for (const entity of entities.slice(0, 2)) {
				calls.push({ operator: 'get_neighbors', args: { id: entity, direction: 'both', asOf: env.asOf } });
			}
			if (entities.length === 0) {
				const scanType = root ?? target;
				if (scanType) calls.push({ operator: 'find_nodes', args: { type: scanType } });
			}
			break;
		}

		case 'multi_hop':
			for (const entity of entities.slice(0, 2)) {
				calls.push({ operator: 'subgraph', args: { root: entity, maxHops: 4, direction: 'both', asOf: env.asOf } });
			}
			break;

		case 'lookup': {
			const anchor = entities[0];
			const anchorType = anchor ? env.nodeById.get(anchor)?.type : undefined;
			const wanted = anchorType ? linkedTypes.find((type) => type !== anchorType) : undefined;
			const distance = anchorType && wanted ? schemaDistance(graph, anchorType, wanted) : 1;

			if (anchor && wanted && distance > 1) {
				calls.push({ operator: 'subgraph', args: { root: anchor, maxHops: distance, direction: 'both', asOf: env.asOf } });
				break;
			}

			for (const entity of entities.slice(0, 3)) {
				calls.push({ operator: 'get_node', args: { id: entity } });
				calls.push({ operator: 'get_neighbors', args: { id: entity, direction: 'both', asOf: env.asOf } });
			}
			break;
		}

		case 'prose':
		default:
			break;
	}

	return calls.slice(0, opts.stepBudget);
}

async function executePlan(env: BenchEnv, calls: PlannedCall[]): Promise<{ results: OperatorResult[]; ids: string[] }> {
	const results: OperatorResult[] = [];
	const ids: string[] = [];
	const answerIds = new Set<string>();
	const seen = new Set<string>();

	const positives = new Set<string>();

	for (const call of calls) {
		const args = { ...call.args };
		if (call.operator === 'set_complement' && (args.exclude === '' || args.exclude === undefined)) {
			args.exclude = [...positives].join(',');
		}

		const result = await runOperator(env.graph, call.operator, args);
		results.push(result);

		if (call.operator === 'count_edges') {
			for (const row of result.rows) {
				if (Number(row.degree) > 0 && typeof row.id === 'string') positives.add(row.id);
			}
		}
		if (call.operator === 'aggregate_over_type') {
			for (const row of result.rows) {
				if (Number(row.count) > 0 && typeof row.id === 'string') positives.add(row.id);
			}
		}

		if (!COUNTING_OPERATORS.has(call.operator) && call.operator !== 'set_complement') {
			for (const id of result.nodeIds) positives.add(id);
		}

		if (ANSWER_OPERATORS.has(call.operator)) {
			for (const id of result.nodeIds) answerIds.add(id);
		}

		for (const id of result.nodeIds) {
			if (seen.has(id)) continue;
			seen.add(id);
			ids.push(id);
		}
	}

	return { results, ids: answerIds.size > 0 ? [...answerIds] : ids };
}


const HANDLERS: Array<{ pattern: RegExp; handle(env: BenchEnv, query: string): PlannedCall[] }> = [
	{
		pattern: /which worker.*(most|highest).*(fail|error|timeout)/i,
		handle: () => [
			{ operator: 'aggregate_over_type', args: { rootType: 'Worker', targetType: 'Job', where: 'status=failed', direction: 'both', maxHops: 1 } }
		]
	},
	{
		pattern: /which worker.*(one|single|exactly)/i,
		handle: () => [
			{ operator: 'aggregate_over_type', args: { rootType: 'Worker', targetType: 'Job', where: 'status=failed', direction: 'both', maxHops: 1 } }
		]
	},
	{
		pattern: /(error code|codes).*(no runbook|not documented|no coverage|uncovered)/i,
		handle: () => [
			{ operator: "aggregate_over_type", args: { rootType: "ErrorCode", targetType: "DocSection", edgeTypes: "DOCUMENTS", direction: "both", maxHops: 1 } },
			{ operator: "set_complement", args: { type: "ErrorCode", exclude: "" } }
		]
	},
	{
		pattern: /same reason as job (\d+)/i,
		handle: (env, query) => {
			const jobId = /job (\d+)/i.exec(query)?.[1];
			const code = env.nodeById.get(`job:${jobId}`)?.attrs.failureReason;
			return typeof code === 'string'
				? [{ operator: 'get_neighbors', args: { id: `errorCode:${code}`, edgeTypes: 'FAILED_WITH', direction: 'in' } }]
				: [];
		}
	},
	{
		pattern: /how do i fix job (\d+)/i,
		handle: (_env, query) => {
			const jobId = /job (\d+)/i.exec(query)?.[1];
			return [{ operator: 'subgraph', args: { root: `job:${jobId}`, maxHops: 2, direction: 'both' } }];
		}
	},
	{
		pattern: /is job (\d+) the same problem as job (\d+)/i,
		handle: (_env, query) => {
			const match = /job (\d+) .*job (\d+)/i.exec(query);
			return match ? [{ operator: 'subgraph_diff', args: { left: `job:${match[1]}`, right: `job:${match[2]}`, maxHops: 2 } }] : [];
		}
	},
	{
		pattern: /which jobs.*queued (after|before) ([\d:\-T ]+)/i,
		handle: (env, query) => {
			const match = /queued after (\d{2}:\d{2}) on (\d{4}-\d{2}-\d{2})/i.exec(query);
			const from = match ? `${match[2]}T${match[1]}:00Z` : env.asOf;
			return [{ operator: 'filter_edges_by_date', args: { edgeTypes: 'RAN_ON,OF_CLASS', from } }];
		}
	},
	{
		pattern: /if (worker-[\w-]+) is drained/i,
		handle: (_env, query) => {
			const worker = /if (worker-[\w-]+) is drained/i.exec(query)?.[1];
			return [{ operator: 'simulate_removal', args: { remove: `worker:${worker}`, observeType: 'Job', direction: 'both' } }];
		}
	},
	{
		pattern: /rank workers.*(exposure|severity)/i,
		handle: (env) => {
			const severe = env.nodes.filter((entry) => entry.type === 'ErrorCode')
				.filter((code) => code.attrs.severity === 'high')
				.map((code) => code.id);
			return [{ operator: 'propagate_risk', args: { sources: severe.join(','), severity: 'high', direction: 'in', maxHops: 2, targetType: 'Worker' } }];
		}
	}
];


function flat(ids: string[]): ArchitectureRun {
	return { ids, top: ids[0] ?? null, calls: [], abstained: ids.length === 0 };
}

async function fromPlan(env: BenchEnv, calls: PlannedCall[]): Promise<ArchitectureRun> {
	if (calls.length === 0) return { ids: [], top: null, calls: [], abstained: true };
	const { results, ids } = (await executePlan(env, calls));
	const ranking = results.find((result) => result.rows.some((row) => row.rank === 1));
	const top = ranking ? String(ranking.rows.find((row) => row.rank === 1)?.id ?? ids[0] ?? '') : (ids[0] ?? null);
	return {
		ids,
		top: top || null,
		calls: calls.map((call) => `${call.operator}(${Object.values(call.args).join(', ')})`),
		abstained: ids.length === 0
	};
}

export const ARCHITECTURES: Architecture[] = [
	{
		name: 'A1_lexical_rag',
		label: 'Standard RAG (lexical top-K)',
		origin: 'paper',
		description: 'Chunk, index, retrieve top-K by term match. The canonical pipeline and the paper\'s Architecture 1.',
		run: async (env, query) => flat((await lexicalIds(env, query.query)))
	},
	{
		name: 'A2_dense_rag',
		label: 'Dense-embedding RAG',
		origin: 'paper',
		description:
			'Identical pipeline, embeddings instead of term match. Tests the "just use better embeddings" objection directly.',
		run: async (env, query) => flat((await denseIds(env, query.query)))
	},
	{
		name: 'A3_hybrid_rrf',
		label: 'Hybrid lexical + dense (RRF)',
		origin: 'vendor',
		description: 'Both retrievers over the same units, fused by reciprocal rank. The pattern every vendor architecture recommends.',
		run: async (env, query) => {
			const fused = reciprocalRankFusion([
				{ source: 'lexical', ids: (await lexicalIds(env, query.query, env.topK * 2)) },
				{ source: 'dense', ids: (await denseIds(env, query.query, env.topK * 2)) }
			]);
			return flat(fused.slice(0, env.topK).map((hit) => hit.id));
		}
	},
	{
		name: 'A4_bespoke_graphrag',
		label: 'Deterministic GraphRAG (bespoke handlers)',
		origin: 'paper',
		description:
			'Hand-written handlers dispatched by keyword, built for the render domain only. The paper\'s Architecture 3, including its co-design problem.',
		run: async (env, query) => {
			const handler = HANDLERS.find((entry) => entry.pattern.test(query.query));
			if (!handler) return flat((await lexicalIds(env, query.query)));
			const calls = handler.handle(env, query.query);
			return calls.length === 0 ? flat((await lexicalIds(env, query.query))) : (await fromPlan(env, calls));
		}
	},
	{
		name: 'A5_agentic_rag',
		label: 'Agentic RAG (ReAct, retrieval tools)',
		origin: 'paper',
		description:
			'Iterative retrieval: search, then look up each entity found, then expand one hop, within a step budget. No computation tools.',
		run: async (env, query) => {
			const budget = 6;
			const calls: string[] = [];
			const seen = new Set<string>();
			const ids: string[] = [];

			const add = (id: string): void => {
				if (seen.has(id)) return;
				seen.add(id);
				ids.push(id);
			};

			for (const id of (await lexicalIds(env, query.query, env.topK))) add(id);
			calls.push(`search_chunks(${query.query})`);

			let frontier = [...ids];
			for (let step = 1; step < budget && frontier.length > 0; step += 1) {
				const next: string[] = [];
				for (const id of frontier.slice(0, 3)) {
					calls.push(`get_neighbors(${id})`);
					for (const neighbour of (await env.graph.neighbors(id, { direction: 'both' }))) {
						if (!seen.has(neighbour.id)) next.push(neighbour.id);
						add(neighbour.id);
					}
					if (calls.length >= budget) break;
				}
				if (calls.length >= budget) break;
				frontier = next;
			}

			return { ids, top: ids[0] ?? null, calls, abstained: ids.length === 0 };
		}
	},
	{
		name: 'A6_traversal_planner',
		label: 'Query planner, 9 traversal primitives',
		origin: 'paper',
		description:
			'Planner composes typed traversal operators. Aggregation and comparison must be emulated by iterating, under a step budget. The paper\'s Architecture 7.',
		run: async (env, query) => (await fromPlan(env, planOperators(env, query.query, { allowComputation: false, stepBudget: 6 })))
	},
	{
		name: 'A7_computation_planner',
		label: 'Adaptive planner, 15 operators',
		origin: 'paper',
		description:
			'The same planner with six graph-computation operators added, each encapsulating a complete algorithm. The paper\'s Architecture 8.',
		run: async (env, query) => (await fromPlan(env, planOperators(env, query.query, { allowComputation: true, stepBudget: 6 })))
	},
	{
		name: 'A8_hybrid_graph_retrieval',
		label: 'Hybrid fused + graph expansion (this repo, retrieval only)',
		origin: 'this repo',
		description:
			'Exact anchors, lexical and dense over one unit set, fused by RRF, expanded along the graph with hop decay, diversified by MMR. No operators.',
		run: async (env, query) => {
			const seeds = (await admittedSeeds(env, query.query));
			if (seeds.length === 0) return { ids: [], top: null, calls: [], abstained: true };

			const scored = new Map<string, { id: string; score: number; text: string }>();
			seeds.forEach((id, index) => {
				const node = env.nodeById.get(id);
				if (node) scored.set(id, { id, score: 1 / (index + 1), text: node.text });
			});

			for (const seedId of seeds.slice(0, 4)) {
				const base = scored.get(seedId)?.score ?? 0;
				for (const entry of (await env.graph.expand([seedId], { maxHops: 2, direction: 'both' }))) {
					if (entry.hops === 0) continue;
					const decayed = base * hopDecay(entry.hops) * 0.9;
					const existing = scored.get(entry.node.id);
					if (existing && existing.score >= decayed) continue;
					scored.set(entry.node.id, { id: entry.node.id, score: decayed, text: entry.node.text });
				}
			}

			const ranked = [...scored.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
			const selected = mmrSelect(ranked, { lambda: 0.7, topK: env.topK });
			return flat(selected.map((entry) => entry.id));
		}
	},
	{
		name: 'A9_hybrid_plus_operators',
		label: 'Hybrid retrieval + operator vocabulary (this repo, production)',
		origin: 'this repo',
		description:
			'Fused retrieval for entry points and prose, plus the full fifteen-operator vocabulary for anything structural. The configuration this repository now ships.',
		run: async (env, query) => {
			const seeds = (await admittedSeeds(env, query.query));
			const calls = planOperators(env, query.query, { allowComputation: true, stepBudget: 6 });

			if (seeds.length === 0 && calls.length === 0) return { ids: [], top: null, calls: [], abstained: true };

			if (seeds.length === 0) return { ids: [], top: null, calls: [], abstained: true };

			const planned = calls.length > 0 ? (await fromPlan(env, calls)) : { ids: [], top: null, calls: [], abstained: false };

			const retrieval = ARCHITECTURES.find((entry) => entry.name === 'A8_hybrid_graph_retrieval') as Architecture;
			const retrieved = await retrieval.run(env, query);

			const ids = [...new Set([...planned.ids, ...retrieved.ids])];
			return { ids, top: planned.top ?? retrieved.top, calls: planned.calls, abstained: ids.length === 0 };
		}
	}
];
