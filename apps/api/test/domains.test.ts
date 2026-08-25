import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	betweenness,
	connectedComponents,
	DOMAIN_REGISTRY,
	Neo4jGraph,
	pagerank,
	shortestPath
} from '@/modules/graph/index.js';
import { BENCH_QUERIES } from '@/eval/structuralQueries.js';
import { closeGraph, isNeo4jAvailable, neo4jSkipReason } from './helpers/neo4j.js';

const hasNeo4j = await isNeo4jAvailable();

describe('domain registry', () => {
	it('registers five distinct domains beyond the two this engine was first built on', () => {
		expect(DOMAIN_REGISTRY.map((entry) => entry.name).sort()).toEqual([
			'aerospace',
			'commerce',
			'finance',
			'logistics',
			'manufacturing',
			'retail'
		]);
	});

	it.each(DOMAIN_REGISTRY.map((entry) => entry.name))('%s declares every edge type its data uses', (name) => {
		const dataset = DOMAIN_REGISTRY.find((entry) => entry.name === name)?.build();
		if (!dataset) throw new Error(`missing ${name}`);

		const declared = new Set(dataset.schema.edgeTypes.map((spec) => spec.name));
		for (const edge of dataset.edges) {
			expect(declared, `${edge.type} is used but not declared in the ${name} schema`).toContain(edge.type);
		}
	});

	it.each(DOMAIN_REGISTRY.map((entry) => entry.name))('%s builds a non-trivial, well-formed dataset', (name) => {
		const dataset = DOMAIN_REGISTRY.find((entry) => entry.name === name)?.build();
		if (!dataset) throw new Error(`missing ${name}`);

		expect(dataset.nodes.length).toBeGreaterThan(20);
		expect(dataset.edges.length).toBeGreaterThan(20);
		expect(dataset.nodes.filter((node) => node.type === 'DocSection').length).toBeGreaterThan(2);

		const ids = dataset.nodes.map((node) => node.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const node of dataset.nodes) {
			expect(node.text.length).toBeGreaterThan(0);
			expect(node.label.length).toBeGreaterThan(0);
		}
	});

	it('covers every registered domain with benchmark queries', () => {
		for (const registration of DOMAIN_REGISTRY) {
			expect(
				BENCH_QUERIES.some((query) => query.domain === registration.name),
				`no queries for ${registration.name}`
			).toBe(true);
		}
	});

	it('spans every intent category in each new domain', () => {
		for (const domain of ['aerospace', 'retail', 'manufacturing', 'logistics', 'finance']) {
			const categories = new Set(BENCH_QUERIES.filter((query) => query.domain === domain).map((query) => query.category));
			for (const required of ['lookup', 'aggregation', 'absence', 'what_if', 'temporal', 'propagation', 'prose', 'out_of_domain']) {
				expect(categories, `${domain} is missing a ${required} case`).toContain(required);
			}
		}
	});
});

describe.skipIf(!hasNeo4j)('graph store and answer keys', () => {
	const graphs = new Map<string, Neo4jGraph>();

	beforeAll(async () => {
		for (const registration of DOMAIN_REGISTRY) {
			graphs.set(registration.name, await Neo4jGraph.sync(registration.build()));
		}
	}, 300_000);

	afterAll(async () => {
		await closeGraph();
	});

	it('resolves a non-empty entity set for every answerable query', async () => {
		const empty: string[] = [];

		for (const query of BENCH_QUERIES) {
			if (query.expectAbstain) continue;
			const graph = graphs.get(query.domain);
			if (!graph) continue;
			if ((await query.required(graph)).length === 0) empty.push(`${query.id} (${query.query})`);
		}

		expect(empty, 'these answer keys computed to nothing — the fixture and the question have drifted apart').toEqual([]);
	}, 300_000);

	it('resolves a ranked answer for every query that demands one', async () => {
		for (const query of BENCH_QUERIES) {
			if (!query.topAnswer) continue;
			const graph = graphs.get(query.domain);
			if (!graph) continue;

			const top = await query.topAnswer(graph);
			expect(top, `${query.id} has no top answer`).toBeTruthy();
			expect(await query.required(graph), `${query.id} ranks an entity it does not require`).toContain(top);
		}
	}, 300_000);

	describe('aerospace reconstruction', () => {
		const asOf = '2024-08-01';

		it('reproduces the single-sourcing finding: every component has exactly one active supplier', async () => {
			const graph = graphs.get('aerospace') as Neo4jGraph;
			const components = await graph.nodes('Component');
			const degrees = await Promise.all(
				components.map((component) => graph.degree(component.id, { direction: 'in', edgeTypes: ['SUPPLIES'], asOf }))
			);

			expect(components).toHaveLength(15);
			expect(degrees.filter((degree) => degree === 1)).toHaveLength(15);
		});

		it('reproduces the 11 / 3 / 1 criticality split', async () => {
			const graph = graphs.get('aerospace') as Neo4jGraph;
			const components = await graph.nodes('Component');
			const count = (level: string): number => components.filter((node) => node.attrs.criticality === level).length;

			expect(count('high')).toBe(11);
			expect(count('medium')).toBe(3);
			expect(count('low')).toBe(1);
		});

		it('leaves exactly one customer outside the Thailand flood blast radius', async () => {
			const graph = graphs.get('aerospace') as Neo4jGraph;
			const affected = new Set(
				(await graph.expand(['risk:EVT-001'], { direction: 'out', maxHops: 5, asOf }))
					.filter((entry) => entry.node.type === 'Customer')
					.map((entry) => entry.node.id)
			);
			const unaffected = (await graph.nodes('Customer')).filter((customer) => !affected.has(customer.id));

			expect(unaffected.map((node) => node.id)).toEqual(['customer:CUS-004']);
			expect(unaffected[0]?.label).toBe('DefenseTech Corp');
		});

		it('excludes the expired ShenzhenChip contract from the active graph but keeps its text', async () => {
			const graph = graphs.get('aerospace') as Neo4jGraph;

			expect(
				(await graph.neighbors('component:CMP-001', { direction: 'in', edgeTypes: ['SUPPLIES'], asOf })).map((node) => node.id)
			).toEqual(['supplier:SUP-001']);

			expect((await graph.node('supplier:SUP-009'))?.label).toBe('ShenzhenChip');
			expect(await graph.neighbors('component:CMP-001', { direction: 'in', edgeTypes: ['SUPPLIES'] })).toHaveLength(2);
		});
	});

	describe('typed centrality and components', () => {
		it('finds the network bottleneck on the hub-induced subgraph', async () => {
			const graph = graphs.get('logistics') as Neo4jGraph;
			expect((await betweenness(graph, { type: 'Hub' })).nodeIds[0]).toBe('hub:HUB-03');
		}, 60_000);

		it('ranks the collector account top on the counterparty graph', async () => {
			const graph = graphs.get('finance') as Neo4jGraph;
			expect((await pagerank(graph, { type: 'Account' })).nodeIds[0]).toBe('account:ACC-05');
		}, 60_000);

		it('reports the closed nominee ring as isolated', async () => {
			const graph = graphs.get('finance') as Neo4jGraph;
			expect((await connectedComponents(graph, { mode: 'isolated', type: 'Account' })).nodeIds.sort()).toEqual([
				'account:ACC-11',
				'account:ACC-12',
				'account:ACC-13'
			]);
		}, 60_000);

		it('reports the feeder hubs as cut off from the trunk network', async () => {
			const graph = graphs.get('logistics') as Neo4jGraph;
			expect((await connectedComponents(graph, { mode: 'isolated', type: 'Hub' })).nodeIds.sort()).toEqual([
				'hub:HUB-09',
				'hub:HUB-10'
			]);
		}, 60_000);

		it('routes along lanes when told to, and takes any link when not', async () => {
			const graph = graphs.get('logistics') as Neo4jGraph;

			const byLane = await shortestPath(graph, { from: 'hub:HUB-01', to: 'hub:HUB-05', edgeTypes: ['LANE_TO'] });
			expect(byLane.nodeIds).toEqual(['hub:HUB-01', 'hub:HUB-03', 'hub:HUB-04', 'hub:HUB-05']);

			const anyLink = await shortestPath(graph, { from: 'hub:HUB-01', to: 'hub:HUB-05' });
			expect(anyLink.nodeIds.length).toBeLessThan(byLane.nodeIds.length);
		});
	});

	describe('domain structure the benchmark depends on', () => {
		it('retail: one product is listed but never ordered', async () => {
			const graph = graphs.get('retail') as Neo4jGraph;
			const products = await graph.nodes('Product');
			const degrees = await Promise.all(
				products.map(async (product) => ({
					id: product.id,
					degree: await graph.degree(product.id, { direction: 'in', edgeTypes: ['OF_PRODUCT'] })
				}))
			);

			expect(degrees.filter((entry) => entry.degree === 0).map((entry) => entry.id)).toEqual(['product:PRD-08']);
		});

		it('retail: the current campaign on EchoBud Pro replaced the summer promotion', async () => {
			const graph = graphs.get('retail') as Neo4jGraph;

			expect(
				(await graph.neighbors('product:PRD-01', { direction: 'in', edgeTypes: ['PROMOTES'], asOf: '2026-08-20' })).map(
					(node) => node.id
				)
			).toEqual(['campaign:CMP-D']);

			expect(await graph.neighbors('product:PRD-01', { direction: 'in', edgeTypes: ['PROMOTES'] })).toHaveLength(2);
		});

		it('manufacturing: the coating cell is the only line that stops when its machine is pulled', async () => {
			const graph = graphs.get('manufacturing') as Neo4jGraph;
			const lines = await graph.nodes('Line');
			const degrees = await Promise.all(
				lines.map(async (line) => ({
					id: line.id,
					degree: await graph.degree(line.id, { direction: 'in', edgeTypes: ['INSTALLED_ON'] })
				}))
			);

			expect(degrees.filter((entry) => entry.degree === 1).map((entry) => entry.id)).toEqual(['line:LN-05']);
		});

		it('manufacturing: defects sit three hops from the line that produced them', async () => {
			const graph = graphs.get('manufacturing') as Neo4jGraph;
			const defects = (await graph.expand(['line:LN-04'], { maxHops: 3, direction: 'both' })).filter(
				(entry) => entry.node.type === 'Defect'
			);

			expect(defects).toHaveLength(4);
			for (const defect of defects) expect(defect.hops).toBe(3);
		});

		it('logistics: exactly one consignee has no delayed shipment', async () => {
			const graph = graphs.get('logistics') as Neo4jGraph;
			const delayed = (await graph.nodes('Shipment')).filter((shipment) => shipment.attrs.delayed === true);
			const consignees = new Set(
				(
					await Promise.all(
						delayed.map(async (shipment) =>
							(await graph.neighbors(shipment.id, { direction: 'out', edgeTypes: ['CONSIGNED_TO'] })).map((node) => node.id)
						)
					)
				).flat()
			);

			expect((await graph.nodes('Consignee')).filter((node) => !consignees.has(node.id)).map((node) => node.id)).toEqual([
				'consignee:CNE-04'
			]);
		});
	});
});

if (!hasNeo4j) {
	describe('graph store and answer keys', () => {
		it.skip(`skipped — ${neo4jSkipReason()}`, () => undefined);
	});
}
