import { closeNeo4j, pingNeo4j } from '@/connections/neo4j.js';
import { Neo4jGraph, type DomainDataset } from '@/modules/graph/index.js';

let cached: boolean | null = null;

export async function isNeo4jAvailable(): Promise<boolean> {
	if (cached === null) cached = await pingNeo4j();
	return cached;
}

export function neo4jSkipReason(): string {
	return 'Neo4j is not reachable. Start it with `docker compose up -d neo4j`.';
}

export async function syncDomain(dataset: DomainDataset): Promise<Neo4jGraph> {
	return Neo4jGraph.sync(dataset);
}

export async function closeGraph(): Promise<void> {
	await closeNeo4j();
	cached = null;
}
