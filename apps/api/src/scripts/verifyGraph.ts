process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.OTEL_ENABLED = 'false';

const { DOMAINS_BY_NAME } = await import('@/modules/graph/index.js');
const { Neo4jGraph } = await import('@/modules/graph/services/neo4jGraph.js');
type Neo4jGraphInstance = InstanceType<typeof Neo4jGraph>;
const ops = await import('@/modules/graph/services/operators.js');
const { closeNeo4j } = await import('@/connections/neo4j.js');

function graphFor(name: string): Neo4jGraphInstance {
	const registration = DOMAINS_BY_NAME.get(name);
	if (!registration) throw new Error(`unknown domain ${name}`);
	return new Neo4jGraph(registration.build().schema);
}

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown): void {
	const same = JSON.stringify(actual) === JSON.stringify(expected);
	if (same) pass += 1;
	else fail += 1;
	process.stdout.write(`${same ? 'PASS' : 'FAIL'}  ${name}\n`);
	if (!same) process.stdout.write(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}\n`);
}

async function main(): Promise<void> {
	const logistics = graphFor('logistics');
	const finance = graphFor('finance');
	const manufacturing = graphFor('manufacturing');
	const aerospace = graphFor('aerospace');
	const retail = graphFor('retail');

	check('traversal: lane route Chennai -> Hamburg',
		(await logistics.shortestPath('hub:HUB-01', 'hub:HUB-05', { edgeTypes: ['LANE_TO'] }))?.path,
		['hub:HUB-01', 'hub:HUB-03', 'hub:HUB-04', 'hub:HUB-05']);

	check('traversal: expired supplier excluded at asOf',
		(await aerospace.neighbors('component:CMP-001', { direction: 'in', edgeTypes: ['SUPPLIES'], asOf: '2024-08-01' })).map((n) => n.id),
		['supplier:SUP-001']);

	check('traversal: both suppliers visible with no asOf',
		(await aerospace.neighbors('component:CMP-001', { direction: 'in', edgeTypes: ['SUPPLIES'] })).length, 2);

	check('degree: single-source components (aerospace)',
		(await Promise.all((await aerospace.nodes('Component')).map(async (n) =>
			(await aerospace.degree(n.id, { direction: 'in', edgeTypes: ['SUPPLIES'], asOf: '2024-08-01' })) === 1 ? n.id : null
		))).filter(Boolean).length, 15);

	check('GDS betweenness: logistics bottleneck',
		(await ops.betweenness(logistics, { type: 'Hub' })).nodeIds[0], 'hub:HUB-03');

	check('GDS pagerank: most central account',
		(await ops.pagerank(finance, { type: 'Account' })).nodeIds[0], 'account:ACC-05');

	check('GDS wcc: isolated hubs',
		(await ops.connectedComponents(logistics, { mode: 'isolated', type: 'Hub' })).nodeIds,
		['hub:HUB-09', 'hub:HUB-10']);

	check('GDS wcc: closed nominee ring',
		(await ops.connectedComponents(finance, { mode: 'isolated', type: 'Account' })).nodeIds,
		['account:ACC-11', 'account:ACC-12', 'account:ACC-13']);

	const lines = await ops.aggregateOverType(manufacturing, { rootType: 'Line', targetType: 'Defect', maxHops: 3 });
	check('aggregate_over_type: line with most defects', lines.rows[0]?.id, 'line:LN-04');
	check('aggregate_over_type: that line has 4', lines.rows[0]?.count, 4);

	const sellers = await ops.aggregateOverType(retail, {
		rootType: 'Seller', targetType: 'Order', edgeTypes: ['FROM_SELLER'], where: { returnedOrRefunded: true }
	});
	check('aggregate_over_type: seller with most returns', sellers.rows[0]?.id, 'seller:SEL-05');

	check('simulate_removal: dropping TechChip strands its sole-sourced parts',
		(await ops.simulateRemoval(aerospace, {
			remove: 'supplier:SUP-001', observeType: 'Component', viaEdgeTypes: ['SUPPLIES'], asOf: '2024-08-01'
		})).nodeIds.sort(),
		['component:CMP-001', 'component:CMP-006', 'component:CMP-014']);

	check('simulate_removal: freezing ACC-08 strands ACC-14',
		(await ops.simulateRemoval(finance, {
			remove: 'account:ACC-08', observeType: 'Account', viaEdgeTypes: ['COUNTERPARTY_OF']
		})).nodeIds,
		['account:ACC-14']);

	const documented = (await aerospace.nodes('Supplier'));
	const withRisk = new Set((await Promise.all(documented.map(async (s) =>
		(await aerospace.degree(s.id, { direction: 'in', edgeTypes: ['AFFECTS'] })) > 0 ? s.id : null))).filter(Boolean) as string[]);
	check('set_complement: supplier with no risk event',
		(await ops.setComplement(aerospace, { type: 'Supplier', exclude: [...withRisk] })).nodeIds,
		['supplier:SUP-009']);

	const risk = await ops.propagateRisk(aerospace, {
		sources: (await aerospace.nodes('RiskEvent')).map((n) => ({ id: n.id, severity: String(n.attrs.severity) })),
		targetType: 'Product', maxHops: 4, asOf: '2024-08-01'
	});
	check('propagate_risk: most exposed aircraft', risk.nodeIds[0], 'product:PRD-001');

	process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
	await closeNeo4j();
	if (fail > 0) process.exitCode = 1;
}

await main();
