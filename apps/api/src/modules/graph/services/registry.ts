import type { Neo4jGraph } from './neo4jGraph.js';
import * as ops from './operators.js';
import type { AttrFilter, OperatorResult } from './operators.js';
import type { Direction, EdgeType, NodeType } from './types.js';

export type OperatorArgs = Record<string, unknown>;

export interface OperatorSpec {
	name: string;
	tier: 'traversal' | 'computation';
	description: string;
	params: Array<{ name: string; required: boolean; description: string }>;
	run(graph: Neo4jGraph, args: OperatorArgs): Promise<OperatorResult>;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
	return undefined;
}

function asList(value: unknown): string[] | undefined {
	if (Array.isArray(value)) return value.map(String).filter((entry) => entry.length > 0);
	const text = asString(value);
	if (!text) return undefined;
	const parts = text.split(/[,|]/).map((entry) => entry.trim()).filter(Boolean);
	return parts.length > 0 ? parts : undefined;
}

function asDirection(value: unknown, fallback: Direction): Direction {
	const text = asString(value);
	return text === 'in' || text === 'out' || text === 'both' ? text : fallback;
}

function asFilter(value: unknown): AttrFilter {
	if (value && typeof value === 'object' && !Array.isArray(value)) return value as AttrFilter;
	const text = asString(value);
	if (!text) return {};
	const out: AttrFilter = {};
	for (const pair of text.split(',')) {
		const [key, raw] = pair.split('=').map((entry) => entry.trim());
		if (!key || raw === undefined) continue;
		out[key] =
			raw === 'true' ? true : raw === 'false' ? false : Number.isFinite(Number(raw)) && raw !== '' ? Number(raw) : raw;
	}
	return out;
}

function opt<T>(key: string, value: T | undefined): Record<string, T> {
	return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}

const edge = (value: unknown): EdgeType[] | undefined => asList(value) as EdgeType[] | undefined;
const nodeType = (value: unknown): NodeType | undefined => asString(value) as NodeType | undefined;

export const OPERATORS: OperatorSpec[] = [
	{
		name: 'find_nodes',
		tier: 'traversal',
		description: 'Scan every node of a type, optionally filtered by attributes. Use to enumerate a population before counting or comparing.',
		params: [
			{ name: 'type', required: false, description: 'Node type to scan, e.g. Job or Product.' },
			{ name: 'where', required: false, description: 'Attribute filter such as status=failed.' }
		],
		run: (graph, args) => ops.findNodes(graph, { ...opt('type', nodeType(args.type)), where: asFilter(args.where) })
	},
	{
		name: 'get_node',
		tier: 'traversal',
		description: 'Fetch one node by id with all its attributes. The exact-lookup operator.',
		params: [{ name: 'id', required: true, description: 'Node id, e.g. job:482.' }],
		run: (graph, args) => ops.getNode(graph, { id: asString(args.id) ?? '' })
	},
	{
		name: 'get_neighbors',
		tier: 'traversal',
		description: 'One hop from a node, optionally restricted to edge types and to a point in time.',
		params: [
			{ name: 'id', required: true, description: 'Node id to expand from.' },
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types.' },
			{ name: 'direction', required: false, description: 'out, in or both. Default both.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) =>
			ops.getNeighbors(graph, {
				id: asString(args.id) ?? '',
				...opt('edgeTypes', edge(args.edgeTypes)),
				direction: asDirection(args.direction, 'both'),
				...opt('asOf', asString(args.asOf))
			})
	},
	{
		name: 'shortest_path',
		tier: 'traversal',
		description: 'How two entities are connected, as an explicit hop path. Answers "is A related to B, and how".',
		params: [
			{ name: 'from', required: true, description: 'Start node id.' },
			{ name: 'to', required: true, description: 'End node id.' },
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types the route may use.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) =>
			ops.shortestPath(graph, {
				from: asString(args.from) ?? '',
				to: asString(args.to) ?? '',
				...opt('edgeTypes', edge(args.edgeTypes)),
				...opt('asOf', asString(args.asOf))
			})
	},
	{
		name: 'subgraph',
		tier: 'traversal',
		description: 'Everything within N hops of a node. Use for multi-hop context gathering around one entity.',
		params: [
			{ name: 'root', required: true, description: 'Node id at the centre.' },
			{ name: 'maxHops', required: false, description: 'Hop radius, default 2.' },
			{ name: 'direction', required: false, description: 'out, in or both.' },
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) =>
			ops.subgraph(graph, {
				root: asString(args.root) ?? '',
				...opt('maxHops', asNumber(args.maxHops)),
				direction: asDirection(args.direction, 'both'),
				...opt('edgeTypes', edge(args.edgeTypes)),
				...opt('asOf', asString(args.asOf))
			})
	},
	{
		name: 'count_edges',
		tier: 'traversal',
		description: 'In or out degree of one node on given edge types. The degree operator behind single-point-of-failure checks.',
		params: [
			{ name: 'id', required: true, description: 'Node id.' },
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types.' },
			{ name: 'direction', required: false, description: 'out, in or both.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) =>
			ops.countEdges(graph, {
				id: asString(args.id) ?? '',
				...opt('edgeTypes', edge(args.edgeTypes)),
				direction: asDirection(args.direction, 'both'),
				...opt('asOf', asString(args.asOf))
			})
	},
	{
		name: 'set_complement',
		tier: 'traversal',
		description: 'All nodes of a type MINUS a subset. Use for "which X are NOT ..." and "which X have no ...". Similarity search cannot answer these at all.',
		params: [
			{ name: 'type', required: true, description: 'Node type forming the universe.' },
			{ name: 'exclude', required: true, description: 'Comma-separated node ids to remove.' }
		],
		run: (graph, args) =>
			ops.setComplement(graph, { type: (asString(args.type) ?? '') as NodeType, exclude: asList(args.exclude) ?? [] })
	},
	{
		name: 'filter_edges_by_date',
		tier: 'traversal',
		description: 'Edges whose validity starts inside a date window. Use for "what changed after X" and "what was true then".',
		params: [
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types.' },
			{ name: 'from', required: false, description: 'ISO lower bound.' },
			{ name: 'to', required: false, description: 'ISO upper bound.' }
		],
		run: (graph, args) =>
			ops.filterEdgesByDate(graph, {
				...opt('edgeTypes', edge(args.edgeTypes)),
				...opt('from', asString(args.from)),
				...opt('to', asString(args.to))
			})
	},
	{
		name: 'propagate_risk',
		tier: 'traversal',
		description: 'Weighted blast-radius scoring from a set of sources, decaying with hop distance. Use for "rank everything by exposure".',
		params: [
			{ name: 'sources', required: true, description: 'Comma-separated source node ids.' },
			{ name: 'severity', required: false, description: 'critical, high, medium or low. Applied to every source.' },
			{ name: 'direction', required: false, description: 'out, in or both. Default out.' },
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types.' },
			{ name: 'maxHops', required: false, description: 'Default 4.' },
			{ name: 'targetType', required: false, description: 'Only score nodes of this type.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) => {
			const severity = asString(args.severity);
			const sources = (asList(args.sources) ?? []).map((id) => ({ id, ...opt('severity', severity) }));
			return ops.propagateRisk(graph, {
				sources,
				direction: asDirection(args.direction, 'out'),
				...opt('edgeTypes', edge(args.edgeTypes)),
				...opt('maxHops', asNumber(args.maxHops)),
				...opt('targetType', nodeType(args.targetType)),
				...opt('asOf', asString(args.asOf))
			});
		}
	},
	{
		name: 'simulate_removal',
		tier: 'computation',
		description: 'Counterfactual: remove a node and report who is left with no alternative. Use for what-if and sole-source questions.',
		params: [
			{ name: 'remove', required: true, description: 'Node id to remove hypothetically.' },
			{ name: 'observeType', required: false, description: 'Only report stranded nodes of this type.' },
			{ name: 'viaEdgeTypes', required: false, description: 'Edge types the dependency runs over.' },
			{ name: 'direction', required: false, description: 'Direction from the observer to the removed node.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) =>
			ops.simulateRemoval(graph, {
				remove: asString(args.remove) ?? '',
				...opt('observeType', nodeType(args.observeType)),
				...opt('viaEdgeTypes', edge(args.viaEdgeTypes)),
				direction: asDirection(args.direction, 'both'),
				...opt('asOf', asString(args.asOf))
			})
	},
	{
		name: 'subgraph_diff',
		tier: 'computation',
		description: 'Compare the neighbourhoods of two entities side by side. Use for "is A more exposed than B" and "are these the same problem".',
		params: [
			{ name: 'left', required: true, description: 'First node id.' },
			{ name: 'right', required: true, description: 'Second node id.' },
			{ name: 'maxHops', required: false, description: 'Default 3.' },
			{ name: 'direction', required: false, description: 'out, in or both.' },
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) =>
			ops.subgraphDiff(graph, {
				left: asString(args.left) ?? '',
				right: asString(args.right) ?? '',
				...opt('maxHops', asNumber(args.maxHops)),
				direction: asDirection(args.direction, 'both'),
				...opt('edgeTypes', edge(args.edgeTypes)),
				...opt('asOf', asString(args.asOf))
			})
	},
	{
		name: 'aggregate_over_type',
		tier: 'computation',
		description: 'For every node of a root type, count the target-type nodes it reaches, then rank. Use this for aggregation questions INSTEAD of iterating manually — a top-K retriever cannot count.',
		params: [
			{ name: 'rootType', required: true, description: 'Type to group by, e.g. Worker or Seller.' },
			{ name: 'targetType', required: true, description: 'Type to count, e.g. Job or Sale.' },
			{ name: 'where', required: false, description: 'Attribute filter on the counted nodes, e.g. status=failed.' },
			{ name: 'edgeTypes', required: false, description: 'Comma-separated edge types.' },
			{ name: 'direction', required: false, description: 'out, in or both.' },
			{ name: 'maxHops', required: false, description: 'Default 1.' },
			{ name: 'asOf', required: false, description: 'ISO date; only edges active then.' }
		],
		run: (graph, args) =>
			ops.aggregateOverType(graph, {
				rootType: (asString(args.rootType) ?? '') as NodeType,
				targetType: (asString(args.targetType) ?? '') as NodeType,
				where: asFilter(args.where),
				...opt('edgeTypes', edge(args.edgeTypes)),
				direction: asDirection(args.direction, 'both'),
				...opt('maxHops', asNumber(args.maxHops)),
				...opt('asOf', asString(args.asOf))
			})
	},
	{
		name: 'betweenness',
		tier: 'computation',
		description: 'Betweenness centrality. Use for "which one is the bottleneck / chokepoint that everything routes through".',
		params: [
			{ name: 'type', required: false, description: 'Rank only nodes of this type.' },
			{ name: 'top', required: false, description: 'How many to return, default 10.' }
		],
		run: (graph, args) => ops.betweenness(graph, { ...opt('type', nodeType(args.type)), ...opt('top', asNumber(args.top)) })
	},
	{
		name: 'pagerank',
		tier: 'computation',
		description: 'PageRank importance. Use for "which one is most central / most influential / most important" in a network.',
		params: [
			{ name: 'type', required: false, description: 'Rank only nodes of this type.' },
			{ name: 'top', required: false, description: 'How many to return, default 10.' }
		],
		run: (graph, args) => ops.pagerank(graph, { ...opt('type', nodeType(args.type)), ...opt('top', asNumber(args.top)) })
	},
	{
		name: 'connected_components',
		tier: 'computation',
		description: 'Weakly connected components. mode=isolated returns everything outside the largest component — use it for "which X are cut off / form a closed group with no link to the rest".',
		params: [
			{ name: 'mode', required: false, description: 'largest (default) or isolated.' },
			{ name: 'type', required: false, description: 'Report only nodes of this type.' }
		],
		run: (graph, args) =>
			ops.connectedComponents(graph, {
				mode: asString(args.mode) === 'isolated' ? 'isolated' : 'largest',
				...opt('type', nodeType(args.type))
			})
	}
];

export const OPERATORS_BY_NAME = new Map(OPERATORS.map((operator) => [operator.name, operator]));

export function isOperatorName(value: string): boolean {
	return OPERATORS_BY_NAME.has(value);
}

export function parseOperatorCall(raw: string): { name: string; args: OperatorArgs } | null {
	const match = /^\s*([a-z_]+)\s*\(([\s\S]*)\)\s*$/i.exec(raw.trim());
	if (!match) return null;

	const name = (match[1] ?? '').toLowerCase();
	const spec = OPERATORS_BY_NAME.get(name);
	if (!spec) return null;

	const body = (match[2] ?? '').trim();
	const args: OperatorArgs = {};
	if (body.length === 0) return { name, args };

	const segments: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let buffer = '';
	for (const char of body) {
		if (quote) {
			if (char === quote) quote = null;
			else buffer += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '[' || char === '{' || char === '(') depth += 1;
		if (char === ']' || char === '}' || char === ')') depth -= 1;
		if (char === ',' && depth === 0) {
			segments.push(buffer.trim());
			buffer = '';
			continue;
		}
		buffer += char;
	}
	if (buffer.trim()) segments.push(buffer.trim());

	let positional = 0;
	for (const segment of segments) {
		const keyed = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([\s\S]*)$/.exec(segment);
		if (keyed && spec.params.some((param) => param.name === keyed[1])) {
			args[keyed[1] as string] = (keyed[2] ?? '').trim().replace(/^\[|\]$/g, '');
			continue;
		}
		const param = spec.params[positional];
		positional += 1;
		if (param) args[param.name] = segment.replace(/^\[|\]$/g, '');
	}

	return { name, args };
}

export async function runOperator(graph: Neo4jGraph, name: string, args: OperatorArgs): Promise<OperatorResult> {
	const spec = OPERATORS_BY_NAME.get(name);
	if (!spec) {
		return {
			operator: name,
			summary: `No operator named ${name} exists. Available: ${OPERATORS.map((entry) => entry.name).join(', ')}.`,
			nodeIds: [],
			rows: [],
			provenance: []
		};
	}
	return spec.run(graph, args);
}

export function describeOperators(): string {
	return OPERATORS.map(
		(operator) => `- ${operator.name}(${operator.params.map((param) => param.name).join(', ')}) — ${operator.description}`
	).join('\n');
}
