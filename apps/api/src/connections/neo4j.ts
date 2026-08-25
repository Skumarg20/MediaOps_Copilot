import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { config } from '@/config.js';
import { recordDependency } from '@/utils/index.js';
import type { DependencyStatus } from '@/types.js';

let driver: Driver | null = null;

export function getDriver(): Driver {
	if (!driver) {
		driver = neo4j.driver(
			config.neo4j.url,
			neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
			{ maxConnectionPoolSize: config.neo4j.poolSize, connectionAcquisitionTimeout: config.neo4j.timeoutMs }
		);
	}
	return driver;
}

export function setDriver(next: Driver | null): void {
	driver = next;
}

export async function withSession<T>(run: (session: Session) => Promise<T>): Promise<T> {
	const session = getDriver().session({ database: config.neo4j.database });
	try {
		return await run(session);
	} finally {
		await session.close();
	}
}

export async function runCypher<T = Record<string, unknown>>(
	cypher: string,
	params: Record<string, unknown> = {}
): Promise<T[]> {
	return withSession(async (session) => {
		const result = await session.run(cypher, params);
		return result.records.map((record) => record.toObject() as T);
	});
}

export async function pingNeo4j(): Promise<boolean> {
	try {
		await runCypher('RETURN 1 AS ok');
		return true;
	} catch {
		return false;
	}
}

export async function neo4jHealth(): Promise<DependencyStatus> {
	const ok = await pingNeo4j();
	const status: DependencyStatus = ok
		? { name: 'neo4j', status: 'up', detail: config.neo4j.url }
		: { name: 'neo4j', status: 'down', detail: `unreachable at ${config.neo4j.url}` };
	recordDependency(status.name, status.status);
	return status;
}

export async function closeNeo4j(): Promise<void> {
	if (!driver) return;
	await driver.close();
	driver = null;
}

export function toNumber(value: unknown): number {
	if (typeof value === 'number') return value;
	if (neo4j.isInt(value)) return (value as { toNumber: () => number }).toNumber();
	return Number(value ?? 0);
}
