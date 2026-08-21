import { config } from '@/config.js';
import { pingDb } from '@/connections/index.js';
import { getContext } from '@/context.js';
import { recordDependency } from '@/utils/index.js';
import type { DependencyStatus } from '@/types.js';

export interface HealthReport {
	status: 'ok' | 'degraded' | 'down';
	checks: Record<string, DependencyStatus>;
	uptime_s: number;
	version: string;
}

export async function checkHealth(): Promise<HealthReport> {
	const ctx = getContext();
	const checks: Record<string, DependencyStatus> = {};

	const dbOk = await pingDb();
	checks.postgres = dbOk
		? { name: 'postgres', status: 'up' }
		: { name: 'postgres', status: 'down', detail: 'select 1 failed' };
	recordDependency('postgres', checks.postgres.status);

	const [vector, vectorless, llm] = await Promise.all([
		ctx.vector.health(),
		ctx.vectorless.health(),
		ctx.llm.health()
	]);

	checks.vector_index = vector;
	checks.vectorless_index = vectorless;
	checks.ollama_generation = llm.generation;
	checks.ollama_embedding = llm.embedding;

	const values = Object.values(checks);
	const status: HealthReport['status'] = values.some((check) => check.status === 'down')
		? 'down'
		: values.some((check) => check.status === 'degraded')
			? 'degraded'
			: 'ok';

	return {
		status,
		checks,
		uptime_s: Math.round((Date.now() - ctx.startedAt) / 1000),
		version: config.version
	};
}
