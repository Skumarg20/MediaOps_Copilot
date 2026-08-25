process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.OTEL_ENABLED = 'false';

const { DOMAIN_REGISTRY } = await import('@/modules/graph/index.js');
const { Neo4jGraph } = await import('@/modules/graph/services/neo4jGraph.js');
const { closeNeo4j, pingNeo4j } = await import('@/connections/neo4j.js');
const { config } = await import('@/config.js');

async function main(): Promise<void> {
	if (!(await pingNeo4j())) {
		process.stderr.write(`neo4j unreachable at ${config.neo4j.url} — start it with: docker compose up -d neo4j\n`);
		process.exit(1);
	}

	process.stdout.write(`syncing ${DOMAIN_REGISTRY.length} domains into ${config.neo4j.url}\n\n`);

	for (const registration of DOMAIN_REGISTRY) {
		const started = Date.now();
		const dataset = registration.build();
		const graph = await Neo4jGraph.sync(dataset);
		process.stdout.write(
			`  ${registration.name.padEnd(16)} ${String(graph.nodeCount).padStart(4)} nodes  ${String(graph.edgeCount).padStart(4)} edges  ${Date.now() - started}ms\n`
		);
	}

	process.stdout.write('\nbrowse at http://localhost:7474\n');
	await closeNeo4j();
}

await main();
