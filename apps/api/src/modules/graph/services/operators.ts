import { runCypher, toNumber } from '@/connections/neo4j.js';
import type { Neo4jGraph } from './neo4jGraph.js';
import type { AttrValue, Direction, EdgeType, GraphNode, NodeType } from './types.js';

export interface OperatorResult {
	operator: string;
	summary: string;
	nodeIds: string[];
	rows: Array<Record<string, AttrValue>>;
	provenance: string[];
}

export type AttrFilter = Record<string, AttrValue | AttrValue[]>;

export const SEVERITY_WEIGHTS: Record<string, number> = { critical: 1.0, high: 0.7, medium: 0.4, low: 0.1 };
export const HOP_DECAY = [1.0, 1.0, 0.6, 0.35, 0.2];

export function hopDecay(hops: number): number {
	return HOP_DECAY[hops] ?? 0;
}

type Args = Record<string, unknown>;

function empty(operator: string, summary: string): OperatorResult {
	return { operator, summary, nodeIds: [], rows: [], provenance: [] };
}

function labelOf(node: GraphNode): string {
	return node.label || node.id;
}

function relTypes(edgeTypes?: EdgeType[]): string {
	return edgeTypes && edgeTypes.length > 0 ? `:${edgeTypes.map((type) => `\`${type}\``).join('|')}` : '';
}

function arrow(direction: Direction = 'both'): [string, string] {
	if (direction === 'out') return ['-', '->'];
	if (direction === 'in') return ['<-', '-'];
	return ['-', '-'];
}

const ACTIVE = `(r.validFrom IS NULL OR $asOf IS NULL OR r.validFrom <= $asOf)
  AND (r.validTo IS NULL OR $asOf IS NULL OR r.validTo > $asOf)`;

function whereAttrs(where: AttrFilter, alias: string, params: Args): string {
	const clauses: string[] = [];
	let index = 0;
	for (const [key, value] of Object.entries(where)) {
		const name = `w${index++}`;
		params[name] = value;
		clauses.push(Array.isArray(value) ? `${alias}.\`${key}\` IN $${name}` : `${alias}.\`${key}\` = $${name}`);
	}
	return clauses.join(' AND ');
}

export async function findNodes(
	graph: Neo4jGraph,
	{ type, where = {} }: { type?: NodeType; where?: AttrFilter }
): Promise<OperatorResult> {
	const params: Args = { domain: graph.domain, ...(type ? { type } : {}) };
	const attrs = whereAttrs(where, 'n', params);
	const filters = [type ? 'n.type = $type' : '', attrs].filter(Boolean).join(' AND ');

	const rows = await runCypher(
		`MATCH (n:Entity {domain: $domain}) ${filters ? `WHERE ${filters}` : ''}
		 RETURN n.id AS id, n.label AS label ORDER BY id`,
		params
	);

	const constraint = Object.entries(where)
		.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('|') : String(value)}`)
		.join(', ');

	return {
		operator: 'find_nodes',
		summary:
			rows.length === 0
				? `No ${type ?? 'node'} matches ${constraint || 'the scan'}.`
				: `${rows.length} ${type ?? 'node'}(s) match ${constraint || 'the scan'}: ${rows.map((row) => row.label).join(', ')}.`,
		nodeIds: rows.map((row) => String(row.id)),
		rows: rows.map((row) => ({ id: String(row.id), label: String(row.label) })),
		provenance: []
	};
}

export async function getNode(graph: Neo4jGraph, { id }: { id: string }): Promise<OperatorResult> {
	const node = await graph.node(id);
	if (!node) return empty('get_node', `No node with id ${id} exists in the ${graph.domain} graph.`);
	return {
		operator: 'get_node',
		summary: `${labelOf(node)} (${node.type}): ${node.text}`,
		nodeIds: [node.id],
		rows: [{ id: node.id, type: node.type, label: node.label, ...node.attrs }],
		provenance: []
	};
}

export async function getNeighbors(
	graph: Neo4jGraph,
	{ id, edgeTypes, direction = 'both', asOf }: { id: string; edgeTypes?: EdgeType[]; direction?: Direction; asOf?: string }
): Promise<OperatorResult> {
	if (!(await graph.has(id))) return empty('get_neighbors', `No node with id ${id} exists.`);

	const [left, right] = arrow(direction);
	const rows = await runCypher(
		`MATCH (n:Entity {id: $id, domain: $domain})${left}[r${relTypes(edgeTypes)}]${right}(m:Entity {domain: $domain})
		 WHERE ${ACTIVE}
		 RETURN DISTINCT m.id AS id, m.label AS label, m.type AS type, type(r) AS edge,
		        CASE WHEN startNode(r).id = $id THEN 'out' ELSE 'in' END AS dir
		 ORDER BY id`,
		{ id, domain: graph.domain, asOf: asOf ?? null }
	);

	if (rows.length === 0) {
		const scope = edgeTypes ? ` ${edgeTypes.join('/')}` : '';
		return empty('get_neighbors', `${id} has no${scope} neighbours${asOf ? ` active at ${asOf}` : ''}.`);
	}

	return {
		operator: 'get_neighbors',
		summary: `${id} connects to ${rows.length} node(s): ${rows.map((row) => `${row.label} (${row.edge})`).join(', ')}.`,
		nodeIds: [...new Set(rows.map((row) => String(row.id)))],
		rows: rows.map((row) => ({
			id: String(row.id),
			label: String(row.label),
			type: String(row.type),
			edge: String(row.edge),
			direction: String(row.dir)
		})),
		provenance: rows.map((row) => `${id} -${row.edge}-> ${row.id}`)
	};
}

export async function shortestPath(
	graph: Neo4jGraph,
	{ from, to, edgeTypes, asOf }: { from: string; to: string; edgeTypes?: EdgeType[]; asOf?: string }
): Promise<OperatorResult> {
	const reached = await graph.shortestPath(from, to, {
		direction: 'both',
		...(edgeTypes ? { edgeTypes } : {}),
		...(asOf ? { asOf } : {})
	});
	if (!reached) return empty('shortest_path', `${from} and ${to} are not connected in the graph.`);

	const readable = reached.path
		.map((id, index) => (index === 0 ? id : `-${reached.via[index - 1] ?? '?'}-> ${id}`))
		.join(' ');

	return {
		operator: 'shortest_path',
		summary: `${from} reaches ${to} in ${reached.hops} hop(s): ${readable}`,
		nodeIds: reached.path,
		rows: [{ from, to, hops: reached.hops, path: reached.path.join(' -> ') }],
		provenance: [readable]
	};
}

export async function subgraph(
	graph: Neo4jGraph,
	{
		root,
		maxHops = 2,
		direction = 'both',
		edgeTypes,
		asOf
	}: { root: string; maxHops?: number; direction?: Direction; edgeTypes?: EdgeType[]; asOf?: string }
): Promise<OperatorResult> {
	if (!(await graph.has(root))) return empty('subgraph', `No node with id ${root} exists.`);

	const reached = await graph.expand([root], {
		maxHops,
		direction,
		...(edgeTypes ? { edgeTypes } : {}),
		...(asOf ? { asOf } : {})
	});

	return {
		operator: 'subgraph',
		summary: `${reached.length} node(s) within ${maxHops} hop(s) of ${root}: ${reached
			.map((entry) => `${labelOf(entry.node)}@${entry.hops}`)
			.join(', ')}.`,
		nodeIds: reached.map((entry) => entry.node.id),
		rows: reached.map((entry) => ({ id: entry.node.id, label: entry.node.label, type: entry.node.type, hops: entry.hops })),
		provenance: reached.filter((entry) => entry.hops > 0).map((entry) => entry.path.join(' -> '))
	};
}

export async function countEdges(
	graph: Neo4jGraph,
	{ id, edgeTypes, direction = 'both', asOf }: { id: string; edgeTypes?: EdgeType[]; direction?: Direction; asOf?: string }
): Promise<OperatorResult> {
	if (!(await graph.has(id))) return empty('count_edges', `No node with id ${id} exists.`);
	const degree = await graph.degree(id, { direction, ...(edgeTypes ? { edgeTypes } : {}), ...(asOf ? { asOf } : {}) });
	return {
		operator: 'count_edges',
		summary: `${id} has ${direction}-degree ${degree}${edgeTypes ? ` on ${edgeTypes.join('/')}` : ''}.`,
		nodeIds: [id],
		rows: [{ id, direction, degree }],
		provenance: []
	};
}

export async function setComplement(
	graph: Neo4jGraph,
	{ type, exclude }: { type: NodeType; exclude: string[] }
): Promise<OperatorResult> {
	const rows = await runCypher(
		`MATCH (n:Entity {domain: $domain, type: $type})
		 WHERE NOT n.id IN $exclude
		 RETURN n.id AS id, n.label AS label ORDER BY id`,
		{ domain: graph.domain, type, exclude }
	);
	const total = (await graph.nodes(type)).length;

	return {
		operator: 'set_complement',
		summary:
			rows.length === 0
				? `Every ${type} is in the excluded set — the complement is empty.`
				: `${rows.length} of ${total} ${type}(s) fall outside the excluded set: ${rows.map((row) => row.label).join(', ')}.`,
		nodeIds: rows.map((row) => String(row.id)),
		rows: rows.map((row) => ({ id: String(row.id), label: String(row.label) })),
		provenance: []
	};
}

export async function filterEdgesByDate(
	graph: Neo4jGraph,
	{ edgeTypes, from, to }: { edgeTypes?: EdgeType[]; from?: string; to?: string }
): Promise<OperatorResult> {
	const rows = await runCypher(
		`MATCH (a:Entity {domain: $domain})-[r${relTypes(edgeTypes)}]->(b:Entity {domain: $domain})
		 WHERE r.validFrom IS NOT NULL
		   AND ($from IS NULL OR r.validFrom >= $from)
		   AND ($to IS NULL OR r.validFrom <= $to)
		 RETURN type(r) AS edge, a.id AS from, b.id AS to, r.validFrom AS validFrom, r.validTo AS validTo
		 ORDER BY validFrom, from, to`,
		{ domain: graph.domain, from: from ?? null, to: to ?? null }
	);

	const touched = [...new Set(rows.flatMap((row) => [String(row.from), String(row.to)]))];
	const window = `[${from ?? 'start'}, ${to ?? 'now'}]`;

	return {
		operator: 'filter_edges_by_date',
		summary:
			rows.length === 0
				? `No ${edgeTypes?.join('/') ?? ''} edge falls in ${window}.`
				: `${rows.length} edge(s) fall in ${window}, touching ${touched.length} node(s).`,
		nodeIds: touched,
		rows: rows.map((row) => ({
			edge: String(row.edge),
			from: String(row.from),
			to: String(row.to),
			validFrom: row.validFrom ? String(row.validFrom) : null,
			validTo: row.validTo ? String(row.validTo) : null
		})),
		provenance: rows.map((row) => `${row.from} -${row.edge}@${row.validFrom ?? '?'}-> ${row.to}`)
	};
}

export async function propagateRisk(
	graph: Neo4jGraph,
	{
		sources,
		direction = 'out',
		edgeTypes,
		maxHops = 4,
		targetType,
		asOf
	}: {
		sources: Array<{ id: string; severity?: string; weight?: number }>;
		direction?: Direction;
		edgeTypes?: EdgeType[];
		maxHops?: number;
		targetType?: NodeType;
		asOf?: string;
	}
): Promise<OperatorResult> {
	if (sources.length === 0) {
		return empty('propagate_risk', 'No node is reachable from the supplied sources, so every propagated score is zero.');
	}

	const resolved = await Promise.all(
		sources.map(async (source) => {
			const node = await graph.node(source.id);
			const own = typeof node?.attrs.severity === 'string' ? node.attrs.severity : undefined;
			const severity = (own ?? source.severity ?? 'medium').toLowerCase();
			return { id: source.id, weight: source.weight ?? SEVERITY_WEIGHTS[severity] ?? 0.4 };
		})
	);

	const [left, right] = arrow(direction);
	const rows = await runCypher(
		`UNWIND $sources AS src
		 MATCH (s:Entity {id: src.id, domain: $domain})
		 MATCH path = (s)${left}[r${relTypes(edgeTypes)}*1..${maxHops}]${right}(t:Entity {domain: $domain})
		 WHERE all(r IN relationships(path) WHERE ${ACTIVE})
		   ${targetType ? 'AND t.type = $targetType' : ''}
		 WITH src, t, min(length(path)) AS hops
		 WITH t.id AS id, t.label AS label, sum(src.weight * $decay[hops]) AS score,
		      collect(src.id)[0] AS via
		 RETURN id, label, score, via ORDER BY score DESC, id ASC`,
		{
			sources: resolved,
			domain: graph.domain,
			asOf: asOf ?? null,
			decay: HOP_DECAY,
			...(targetType ? { targetType } : {})
		}
	);

	const ranked = rows
		.map((row) => ({ id: String(row.id), label: String(row.label), score: Number(toNumber(row.score).toFixed(4)), via: String(row.via) }))
		.filter((entry) => entry.score > 0);

	return {
		operator: 'propagate_risk',
		summary:
			ranked.length === 0
				? 'No node is reachable from the supplied sources, so every propagated score is zero.'
				: `Weighted exposure over ${sources.length} source(s): ${ranked.slice(0, 8).map((entry) => `${entry.label}=${entry.score}`).join(', ')}.`,
		nodeIds: ranked.map((entry) => entry.id),
		rows: ranked.map((entry, index) => ({ rank: index + 1, id: entry.id, label: entry.label, score: entry.score })),
		provenance: ranked.slice(0, 8).map((entry) => `${entry.via} ... ${entry.id}`)
	};
}

export async function simulateRemoval(
	graph: Neo4jGraph,
	{
		remove,
		observeType,
		viaEdgeTypes,
		direction = 'both',
		asOf
	}: { remove: string; observeType?: NodeType; viaEdgeTypes?: EdgeType[]; direction?: Direction; asOf?: string }
): Promise<OperatorResult> {
	void direction;
	if (!(await graph.has(remove))) {
		return empty('simulate_removal', `No node with id ${remove} exists, so nothing can be removed.`);
	}

	const rows = await runCypher(
		`MATCH (target:Entity {id: $remove, domain: $domain})-[r${relTypes(viaEdgeTypes)}]-(dep:Entity {domain: $domain})
		 WHERE ${ACTIVE} ${observeType ? 'AND dep.type = $observeType' : ''}
		 WITH DISTINCT dep, target, collect(DISTINCT type(r)) AS linkTypes
		 CALL (dep, target, linkTypes) {
		   MATCH (dep)-[r]-(other:Entity {domain: $domain})
		   WHERE type(r) IN linkTypes AND other.id <> target.id AND ${ACTIVE}
		   RETURN count(r) AS survivors
		 }
		 RETURN dep.id AS id, dep.label AS label, dep.type AS type, survivors ORDER BY id`,
		{ remove, domain: graph.domain, asOf: asOf ?? null, ...(observeType ? { observeType } : {}) }
	);

	const stranded = rows.filter((row) => toNumber(row.survivors) === 0);

	return {
		operator: 'simulate_removal',
		summary:
			rows.length === 0
				? `Nothing of type ${observeType ?? 'any'} connects to ${remove}, so removing it strands nobody.`
				: `Removing ${remove} strands ${stranded.length} of ${rows.length} connected ${observeType ?? 'node'}(s)` +
					(stranded.length > 0 ? `: ${stranded.map((row) => row.label).join(', ')}.` : ' — every one has an alternative.'),
		nodeIds: stranded.map((row) => String(row.id)),
		rows: rows.map((row) => ({
			id: String(row.id),
			label: String(row.label),
			type: String(row.type),
			stranded: toNumber(row.survivors) === 0
		})),
		provenance: stranded.map((row) => `${row.id} -depends-solely-on-> ${remove}`)
	};
}

export async function subgraphDiff(
	graph: Neo4jGraph,
	{
		left,
		right,
		maxHops = 3,
		direction = 'both',
		edgeTypes,
		asOf
	}: { left: string; right: string; maxHops?: number; direction?: Direction; edgeTypes?: EdgeType[]; asOf?: string }
): Promise<OperatorResult> {
	if (!(await graph.has(left)) || !(await graph.has(right))) {
		const missing = (await graph.has(left)) ? right : left;
		return empty('subgraph_diff', `Cannot compare: ${missing} is not in the graph.`);
	}

	const opts = { maxHops, direction, ...(edgeTypes ? { edgeTypes } : {}), ...(asOf ? { asOf } : {}) };
	const [leftReach, rightReach] = await Promise.all([graph.expand([left], opts), graph.expand([right], opts)]);

	const leftHits = leftReach.filter((entry) => entry.hops > 0);
	const rightHits = rightReach.filter((entry) => entry.hops > 0);
	const leftIds = new Set(leftHits.map((entry) => entry.node.id));
	const rightIds = new Set(rightHits.map((entry) => entry.node.id));
	const shared = [...leftIds].filter((id) => rightIds.has(id)).sort();

	const countByType = (hits: typeof leftHits): Map<NodeType, number> => {
		const counts = new Map<NodeType, number>();
		for (const entry of hits) counts.set(entry.node.type, (counts.get(entry.node.type) ?? 0) + 1);
		return counts;
	};

	const leftCounts = countByType(leftHits);
	const rightCounts = countByType(rightHits);
	const types = [...new Set([...leftCounts.keys(), ...rightCounts.keys()])].sort();
	const depth = (hits: typeof leftHits): number => hits.reduce((max, entry) => Math.max(max, entry.hops), 0);

	const rows: OperatorResult['rows'] = [
		{ metric: 'depth', left: depth(leftHits), right: depth(rightHits), delta: depth(leftHits) - depth(rightHits) },
		...types.map((type) => {
			const a = leftCounts.get(type) ?? 0;
			const b = rightCounts.get(type) ?? 0;
			return { metric: type, left: a, right: b, delta: a - b };
		}),
		{ metric: 'shared_nodes', left: shared.length, right: shared.length, delta: 0 }
	];

	const differences = rows
		.filter((row) => Number(row.delta) !== 0)
		.map((row) => `${row.metric}: ${left}=${row.left} vs ${right}=${row.right}`);

	return {
		operator: 'subgraph_diff',
		summary:
			differences.length === 0
				? `${left} and ${right} have structurally identical ${maxHops}-hop neighbourhoods (${shared.length} shared node(s)).`
				: `${left} vs ${right} over ${maxHops} hops — ${differences.join('; ')}. Shared: ${shared.length === 0 ? 'none' : shared.join(', ')}.`,
		nodeIds: [...new Set([left, right, ...leftIds, ...rightIds])],
		rows,
		provenance: shared.map((id) => `${left} ... ${id} ... ${right}`)
	};
}

export async function aggregateOverType(
	graph: Neo4jGraph,
	{
		rootType,
		targetType,
		where = {},
		edgeTypes,
		direction = 'both',
		maxHops = 1,
		asOf
	}: {
		rootType: NodeType;
		targetType: NodeType;
		where?: AttrFilter;
		edgeTypes?: EdgeType[];
		direction?: Direction;
		maxHops?: number;
		asOf?: string;
	}
): Promise<OperatorResult> {
	const params: Args = { domain: graph.domain, rootType, targetType, asOf: asOf ?? null };
	const attrs = whereAttrs(where, 't', params);
	const [left, right] = arrow(direction);

	const rows = await runCypher(
		`MATCH (root:Entity {domain: $domain, type: $rootType})
		 OPTIONAL MATCH path = (root)${left}[r${relTypes(edgeTypes)}*1..${maxHops}]${right}(t:Entity {domain: $domain, type: $targetType})
		 WHERE all(r IN relationships(path) WHERE ${ACTIVE}) ${attrs ? `AND ${attrs}` : ''}
		 WITH root, collect(DISTINCT t.id) AS members
		 RETURN root.id AS id, root.label AS label, size(members) AS count, members
		 ORDER BY count DESC, id ASC`,
		params
	);

	const ranked = rows.map((row) => ({
		id: String(row.id),
		label: String(row.label),
		count: toNumber(row.count),
		members: ((row.members as string[]) ?? []).slice().sort()
	}));
	const top = ranked[0];
	const total = ranked.reduce((sum, entry) => sum + entry.count, 0);
	const constraint = Object.entries(where)
		.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join('|') : String(value)}`)
		.join(', ');

	return {
		operator: 'aggregate_over_type',
		summary:
			!top || top.count === 0
				? `No ${rootType} reaches any ${targetType}${constraint ? ` with ${constraint}` : ''}.`
				: `${total} ${targetType}(s)${constraint ? ` with ${constraint}` : ''} across ${ranked.length} ${rootType}(s). ` +
					`Highest: ${top.label} with ${top.count}. Full ranking: ` +
					ranked.filter((entry) => entry.count > 0).map((entry) => `${entry.label}=${entry.count}`).join(', ') +
					'.',
		nodeIds: [
			...ranked.filter((entry) => entry.count > 0).map((entry) => entry.id),
			...new Set(ranked.flatMap((entry) => entry.members))
		],
		rows: ranked.map((entry, index) => ({
			rank: index + 1,
			id: entry.id,
			label: entry.label,
			count: entry.count,
			members: entry.members.join(' ')
		})),
		provenance: ranked.filter((entry) => entry.count > 0).map((entry) => `${entry.id} -> [${entry.members.join(', ')}]`)
	};
}

async function projectTyped(graph: Neo4jGraph, type: NodeType | undefined, name: string): Promise<boolean> {
	await runCypher('CALL gds.graph.drop($name, false) YIELD graphName RETURN graphName', { name }).catch(() => []);
	const label = type ? `\`${type}\`` : 'Entity';
	const projected = await runCypher(
		`MATCH (a:${label} {domain: $domain})-[r]-(b:${label} {domain: $domain})
		 RETURN gds.graph.project($name, a, b, {}, {undirectedRelationshipTypes: ['*']}) AS g`,
		{ domain: graph.domain, name }
	).catch(() => []);
	return projected.length > 0;
}

async function gdsStream(
	graph: Neo4jGraph,
	procedure: 'gds.pageRank' | 'gds.betweenness' | 'gds.wcc',
	type?: NodeType
): Promise<Array<{ id: string; label: string; score: number }>> {
	const name = `${graph.domain}-${procedure}-${type ?? 'all'}`;
	if (!(await projectTyped(graph, type, name))) return [];

	const rows = await runCypher(
		`CALL ${procedure}.stream($name)
		 YIELD nodeId, ${procedure === 'gds.wcc' ? 'componentId AS value' : 'score AS value'}
		 WITH gds.util.asNode(nodeId) AS n, value
		 RETURN n.id AS id, n.label AS label, value ORDER BY value DESC, id ASC`,
		{ name }
	);
	await runCypher('CALL gds.graph.drop($name, false) YIELD graphName RETURN graphName', { name }).catch(() => []);
	return rows.map((row) => ({ id: String(row.id), label: String(row.label), score: toNumber(row.value) }));
}

export async function pagerank(
	graph: Neo4jGraph,
	{ type, top = 10 }: { type?: NodeType; top?: number } = {}
): Promise<OperatorResult> {
	const ranked = (await gdsStream(graph, 'gds.pageRank', type)).slice(0, top);
	return {
		operator: 'pagerank',
		summary: `Influence ranking by PageRank${type ? ` over ${type} nodes` : ''}: ${ranked.map((entry) => `${entry.label}=${entry.score.toFixed(5)}`).join(', ')}.`,
		nodeIds: ranked.map((entry) => entry.id),
		rows: ranked.map((entry, index) => ({ rank: index + 1, id: entry.id, label: entry.label, score: Number(entry.score.toFixed(5)) })),
		provenance: []
	};
}

export async function betweenness(
	graph: Neo4jGraph,
	{ type, top = 10 }: { type?: NodeType; top?: number } = {}
): Promise<OperatorResult> {
	const ranked = (await gdsStream(graph, 'gds.betweenness', type)).slice(0, top);
	return {
		operator: 'betweenness',
		summary: `Bottleneck ranking by betweenness centrality${type ? ` over ${type} nodes` : ''}: ${ranked.map((entry) => `${entry.label}=${entry.score}`).join(', ')}.`,
		nodeIds: ranked.map((entry) => entry.id),
		rows: ranked.map((entry, index) => ({ rank: index + 1, id: entry.id, label: entry.label, score: entry.score })),
		provenance: []
	};
}

export async function connectedComponents(
	graph: Neo4jGraph,
	{ mode = 'largest', type }: { mode?: 'largest' | 'isolated'; type?: NodeType } = {}
): Promise<OperatorResult> {
	const ranked = await gdsStream(graph, 'gds.wcc', type);
	const groups = new Map<number, Array<{ id: string; label: string }>>();
	for (const entry of ranked) {
		const bucket = groups.get(entry.score);
		if (bucket) bucket.push(entry);
		else groups.set(entry.score, [entry]);
	}

	const components = [...groups.values()].sort(
		(a, b) => b.length - a.length || (a[0]?.id ?? '').localeCompare(b[0]?.id ?? '')
	);
	const largest = components[0] ?? [];
	const outside = components.slice(1).flat();
	const chosen = mode === 'isolated' ? outside : largest;
	const answer = chosen.map((entry) => entry.id).sort();

	return {
		operator: 'connected_components',
		summary:
			mode === 'isolated'
				? `${components.length} weakly connected component(s). ${answer.length} ${type ?? 'node'}(s) sit outside the largest: ${answer.length === 0 ? 'none' : chosen.map((entry) => entry.label).join(', ')}.`
				: `${components.length} weakly connected component(s); the largest holds ${largest.length} node(s).`,
		nodeIds: answer,
		rows: components.map((members, index) => ({
			component: index + 1,
			size: members.length,
			members: members.map((entry) => entry.id).join(' ')
		})),
		provenance: []
	};
}
