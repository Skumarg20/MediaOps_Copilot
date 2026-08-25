import type { Neo4jGraph } from '@/modules/graph/index.js';

export interface Tally {
	id: string;
	count: number;
}

export async function rankByReach(
	graph: Neo4jGraph,
	opts: {
		rootType: string;
		targetType: string;
		edgeTypes?: string[];
		maxHops?: number;
		asOf?: string;
		where?: (attrs: Record<string, unknown>) => boolean;
	}
): Promise<Tally[]> {
	const { rootType, targetType, edgeTypes, maxHops = 1, asOf, where } = opts;
	const roots = await graph.nodes(rootType);

	const tallies = await Promise.all(
		roots.map(async (root) => ({
			id: root.id,
			count: (
				await graph.expand([root.id], {
					maxHops,
					direction: 'both',
					...(edgeTypes ? { edgeTypes } : {}),
					...(asOf ? { asOf } : {})
				})
			).filter((entry) => entry.hops > 0 && entry.node.type === targetType && (!where || where(entry.node.attrs))).length
		}))
	);

	return tallies.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export async function reachedOfType(
	graph: Neo4jGraph,
	rootId: string,
	opts: {
		targetType: string;
		edgeTypes?: string[];
		maxHops?: number;
		asOf?: string;
		where?: (attrs: Record<string, unknown>) => boolean;
	}
): Promise<string[]> {
	const reached = await graph.expand([rootId], {
		maxHops: opts.maxHops ?? 1,
		direction: 'both',
		...(opts.edgeTypes ? { edgeTypes: opts.edgeTypes } : {}),
		...(opts.asOf ? { asOf: opts.asOf } : {})
	});

	return reached
		.filter((entry) => entry.hops > 0 && entry.node.type === opts.targetType && (!opts.where || opts.where(entry.node.attrs)))
		.map((entry) => entry.node.id);
}

export async function withDegree(
	graph: Neo4jGraph,
	opts: { type: string; edgeTypes: string[]; degree: number; direction?: 'in' | 'out' | 'both'; asOf?: string }
): Promise<string[]> {
	const nodes = await graph.nodes(opts.type);
	const degrees = await Promise.all(
		nodes.map(async (node) => ({
			id: node.id,
			degree: await graph.degree(node.id, {
				direction: opts.direction ?? 'both',
				edgeTypes: opts.edgeTypes,
				...(opts.asOf ? { asOf: opts.asOf } : {})
			})
		}))
	);
	return degrees.filter((entry) => entry.degree === opts.degree).map((entry) => entry.id);
}

export async function withoutRelation(
	graph: Neo4jGraph,
	opts: { type: string; edgeTypes: string[]; direction?: 'in' | 'out' | 'both'; asOf?: string }
): Promise<string[]> {
	return withDegree(graph, { ...opts, degree: 0 });
}

export async function blastRadius(
	graph: Neo4jGraph,
	opts: { from: string; targetType: string; maxHops?: number; direction?: 'in' | 'out' | 'both'; asOf?: string }
): Promise<string[]> {
	const reached = await graph.expand([opts.from], {
		maxHops: opts.maxHops ?? 4,
		direction: opts.direction ?? 'out',
		...(opts.asOf ? { asOf: opts.asOf } : {})
	});
	return reached.filter((entry) => entry.hops > 0 && entry.node.type === opts.targetType).map((entry) => entry.node.id);
}

export async function complementOf(graph: Neo4jGraph, type: string, exclude: string[]): Promise<string[]> {
	const excluded = new Set(exclude);
	return (await graph.nodes(type)).filter((node) => !excluded.has(node.id)).map((node) => node.id);
}

export async function strandedBy(
	graph: Neo4jGraph,
	opts: { remove: string; observeType: string; edgeTypes: string[]; asOf?: string }
): Promise<string[]> {
	const asOfOpt = opts.asOf ? { asOf: opts.asOf } : {};
	const neighbours = (await graph.neighbors(opts.remove, { direction: 'both', edgeTypes: opts.edgeTypes, ...asOfOpt })).filter(
		(node) => node.type === opts.observeType
	);

	const checked = await Promise.all(
		neighbours.map(async (node) => ({
			id: node.id,
			others: (await graph.neighbors(node.id, { direction: 'both', edgeTypes: opts.edgeTypes, ...asOfOpt })).filter(
				(other) => other.id !== opts.remove
			).length
		}))
	);

	return checked.filter((entry) => entry.others === 0).map((entry) => entry.id);
}

export async function onOrAfter(graph: Neo4jGraph, type: string, attribute: string, bound: string): Promise<string[]> {
	return (await graph.nodes(type)).filter((node) => String(node.attrs[attribute] ?? '') >= bound).map((node) => node.id);
}

export async function sectionsMatching(graph: Neo4jGraph, pattern: RegExp): Promise<string[]> {
	return (await graph.nodes('DocSection')).filter((section) => pattern.test(section.text)).map((section) => section.id);
}

export async function exposureRanking(
	graph: Neo4jGraph,
	opts: { sourceType: string; targetType: string; maxHops?: number; asOf?: string }
): Promise<Tally[]> {
	const weights: Record<string, number> = { critical: 1, high: 0.7, medium: 0.4, low: 0.1 };
	const decay = [1, 1, 0.6, 0.35, 0.2];
	const scores = new Map<string, number>();

	for (const source of await graph.nodes(opts.sourceType)) {
		const severity = String(source.attrs.severity ?? 'medium').toLowerCase();
		const weight = weights[severity] ?? 0.4;

		const reached = await graph.expand([source.id], {
			maxHops: opts.maxHops ?? 4,
			direction: 'both',
			...(opts.asOf ? { asOf: opts.asOf } : {})
		});

		for (const entry of reached) {
			if (entry.hops === 0 || entry.node.type !== opts.targetType) continue;
			const contribution = weight * (decay[entry.hops] ?? 0);
			if (contribution === 0) continue;
			scores.set(entry.node.id, (scores.get(entry.node.id) ?? 0) + contribution);
		}
	}

	return [...scores.entries()]
		.map(([id, count]) => ({ id, count: Number(count.toFixed(4)) }))
		.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
