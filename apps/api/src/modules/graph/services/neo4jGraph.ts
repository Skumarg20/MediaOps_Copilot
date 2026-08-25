import { runCypher, toNumber } from '@/connections/neo4j.js';
import type { DomainDataset, GraphEdge, GraphNode, GraphSchema, NodeType, ReachedNode, TraversalOptions } from './types.js';

type Row = Record<string, unknown>;

function nodeFrom(raw: Row): GraphNode {
	const props = (raw.props ?? {}) as Record<string, unknown>;
	const { id, type, label, text, domain, ...attrs } = props;
	void domain;
	return {
		id: String(id),
		type: String(type),
		label: String(label ?? id),
		text: String(text ?? ''),
		attrs: Object.fromEntries(
			Object.entries(attrs).map(([key, value]) => [key, typeof value === 'object' && value !== null ? toNumber(value) : (value as never)])
		)
	};
}

const MAX_EXPAND_HOPS = 8;

const ACTIVE = `(r.validFrom IS NULL OR $asOf IS NULL OR r.validFrom <= $asOf)
  AND (r.validTo IS NULL OR $asOf IS NULL OR r.validTo > $asOf)`;

function arrow(direction: string): [string, string] {
	if (direction === 'out') return ['-', '->'];
	if (direction === 'in') return ['<-', '-'];
	return ['-', '-'];
}

export class Neo4jGraph {
	readonly schema: GraphSchema;
	readonly domain: string;
	private counts = { nodes: 0, edges: 0 };

	constructor(schema: GraphSchema) {
		this.schema = schema;
		this.domain = schema.domain;
	}

	static async sync(dataset: DomainDataset): Promise<Neo4jGraph> {
		const graph = new Neo4jGraph(dataset.schema);
		const domain = dataset.schema.domain;

		await runCypher('MATCH (n:Entity {domain: $domain}) DETACH DELETE n', { domain });
		await runCypher('CREATE INDEX entity_id IF NOT EXISTS FOR (n:Entity) ON (n.id, n.domain)');

		const nodes = dataset.nodes.map((node) => ({
			id: node.id,
			type: node.type,
			props: { id: node.id, domain, type: node.type, label: node.label, text: node.text, ...node.attrs }
		}));

		await runCypher(
			`UNWIND $nodes AS row
			 CREATE (n:Entity)
			 SET n = row.props
			 WITH n, row
			 CALL apoc.create.addLabels(n, [row.type]) YIELD node
			 RETURN count(node)`,
			{ nodes }
		).catch(async () => {
			for (const group of groupBy(nodes, (node) => node.type)) {
				await runCypher(
					`UNWIND $rows AS row CREATE (n:Entity:\`${group.key}\`) SET n = row.props`,
					{ rows: group.items }
				);
			}
		});

		for (const group of groupBy(dataset.edges, (edge) => edge.type)) {
			await runCypher(
				`UNWIND $rows AS row
				 MATCH (a:Entity {id: row.from, domain: $domain})
				 MATCH (b:Entity {id: row.to, domain: $domain})
				 CREATE (a)-[r:\`${group.key}\`]->(b)
				 SET r.domain = $domain, r.validFrom = row.validFrom, r.validTo = row.validTo, r.weight = row.weight`,
				{
					domain,
					rows: group.items.map((edge: GraphEdge) => ({
						from: edge.from,
						to: edge.to,
						validFrom: edge.validFrom ?? null,
						validTo: edge.validTo ?? null,
						weight: edge.weight ?? 1
					}))
				}
			);
		}

		graph.counts = {
			nodes: dataset.nodes.length,
			edges: dataset.edges.length
		};
		return graph;
	}

	get nodeCount(): number {
		return this.counts.nodes;
	}

	get edgeCount(): number {
		return this.counts.edges;
	}

	async node(id: string): Promise<GraphNode | undefined> {
		const rows = await runCypher('MATCH (n:Entity {id: $id, domain: $domain}) RETURN properties(n) AS props', {
			id,
			domain: this.domain
		});
		return rows[0] ? nodeFrom(rows[0]) : undefined;
	}

	async has(id: string): Promise<boolean> {
		return (await this.node(id)) !== undefined;
	}

	async nodes(type?: NodeType): Promise<GraphNode[]> {
		const rows = await runCypher(
			`MATCH (n:Entity {domain: $domain}) ${type ? 'WHERE n.type = $type' : ''} RETURN properties(n) AS props ORDER BY n.id`,
			{ domain: this.domain, ...(type ? { type } : {}) }
		);
		return rows.map(nodeFrom);
	}

	nodeTypes(): NodeType[] {
		return this.schema.nodeTypes.map((entry) => entry.name).sort();
	}

	edgeTypesBetween(a: NodeType, b: NodeType): string[] {
		return this.schema.edgeTypes
			.filter((spec) => (spec.from === a && spec.to === b) || (spec.from === b && spec.to === a))
			.map((spec) => spec.name);
	}

	adjacentTypes(type: NodeType): NodeType[] {
		const out = new Set<NodeType>();
		for (const spec of this.schema.edgeTypes) {
			if (spec.from === type) out.add(spec.to);
			if (spec.to === type) out.add(spec.from);
		}
		out.delete(type);
		return [...out].sort();
	}

	private relPattern(opts: TraversalOptions, hops?: string): string {
		const types = opts.edgeTypes && opts.edgeTypes.length > 0 ? `:${opts.edgeTypes.map((t) => `\`${t}\``).join('|')}` : '';
		return `[r${types}${hops ?? ''}]`;
	}

	async neighbors(id: string, opts: TraversalOptions = {}): Promise<GraphNode[]> {
		const [left, right] = arrow(opts.direction ?? 'out');
		const rows = await runCypher(
			`MATCH (n:Entity {id: $id, domain: $domain})${left}${this.relPattern(opts)}${right}(m:Entity {domain: $domain})
			 WHERE ${ACTIVE}
			 RETURN DISTINCT properties(m) AS props, m.id AS id ORDER BY id`,
			{ id, domain: this.domain, asOf: opts.asOf ?? null }
		);
		return rows.map(nodeFrom);
	}

	async degree(id: string, opts: TraversalOptions = {}): Promise<number> {
		const [left, right] = arrow(opts.direction ?? 'out');
		const rows = await runCypher(
			`MATCH (n:Entity {id: $id, domain: $domain})${left}${this.relPattern(opts)}${right}(m:Entity {domain: $domain})
			 WHERE ${ACTIVE}
			 RETURN count(r) AS degree`,
			{ id, domain: this.domain, asOf: opts.asOf ?? null }
		);
		return toNumber(rows[0]?.degree);
	}

	async expand(seeds: string[], opts: TraversalOptions = {}): Promise<ReachedNode[]> {
		const maxHops = Math.min(opts.maxHops ?? 2, MAX_EXPAND_HOPS);
		const [left, right] = arrow(opts.direction ?? 'both');
		const rows = await runCypher(
			`UNWIND $seeds AS seed
			 MATCH (s:Entity {id: seed, domain: $domain})
			 MATCH (m:Entity {domain: $domain})
			 WHERE m <> s
			 MATCH path = shortestPath((s)${left}${this.relPattern(opts, `*1..${maxHops}`)}${right}(m))
			 WHERE all(r IN relationships(path) WHERE ${ACTIVE})
			 WITH m, path, length(path) AS hops
			 ORDER BY hops ASC
			 WITH m.id AS id, collect({props: properties(m), hops: hops, path: [x IN nodes(path) | x.id], via: [x IN relationships(path) | type(x)]})[0] AS best
			 RETURN best.props AS props, best.hops AS hops, best.path AS path, best.via AS via
			 ORDER BY hops ASC, id ASC`,
			{ seeds, domain: this.domain, asOf: opts.asOf ?? null }
		);

		const reached: ReachedNode[] = rows.map((row) => ({
			node: nodeFrom(row),
			hops: toNumber(row.hops),
			path: (row.path as string[]) ?? [],
			via: (row.via as string[]) ?? []
		}));

		const seedNodes = await Promise.all(seeds.map((seed) => this.node(seed)));
		const seen = new Set(reached.map((entry) => entry.node.id));
		const heads: ReachedNode[] = [];
		for (const node of seedNodes) {
			if (!node || seen.has(node.id)) continue;
			heads.push({ node, hops: 0, path: [node.id], via: [] });
			seen.add(node.id);
		}

		return [...heads, ...reached.filter((entry) => !seeds.includes(entry.node.id))];
	}

	async shortestPath(from: string, to: string, opts: TraversalOptions = {}): Promise<ReachedNode | null> {
		const types = opts.edgeTypes && opts.edgeTypes.length > 0 ? `:${opts.edgeTypes.map((t) => `\`${t}\``).join('|')}` : '';
		const rows = await runCypher(
			`MATCH (a:Entity {id: $from, domain: $domain}), (b:Entity {id: $to, domain: $domain})
			 MATCH path = shortestPath((a)-[${types}*..15]-(b))
			 WHERE all(r IN relationships(path) WHERE ${ACTIVE})
			 RETURN properties(b) AS props, length(path) AS hops,
			        [x IN nodes(path) | x.id] AS path, [x IN relationships(path) | type(x)] AS via`,
			{ from, to, domain: this.domain, asOf: opts.asOf ?? null }
		);
		if (!rows[0]) return null;
		return {
			node: nodeFrom(rows[0]),
			hops: toNumber(rows[0].hops),
			path: (rows[0].path as string[]) ?? [],
			via: (rows[0].via as string[]) ?? []
		};
	}

	async edges(): Promise<GraphEdge[]> {
		const rows = await runCypher(
			`MATCH (a:Entity {domain: $domain})-[r]->(b:Entity {domain: $domain})
			 RETURN type(r) AS type, a.id AS from, b.id AS to, r.validFrom AS validFrom, r.validTo AS validTo, r.weight AS weight`,
			{ domain: this.domain }
		);
		return rows.map((row) => ({
			type: String(row.type),
			from: String(row.from),
			to: String(row.to),
			...(row.validFrom ? { validFrom: String(row.validFrom) } : {}),
			...(row.validTo ? { validTo: String(row.validTo) } : {}),
			weight: toNumber(row.weight)
		}));
	}
}

function groupBy<T>(items: T[], key: (item: T) => string): Array<{ key: string; items: T[] }> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const bucket = map.get(key(item));
		if (bucket) bucket.push(item);
		else map.set(key(item), [item]);
	}
	return [...map.entries()].map(([groupKey, groupItems]) => ({ key: groupKey, items: groupItems }));
}
