import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'copilot_process_' });

export const requestsTotal = new Counter({
  name: 'copilot_requests_total',
  help: 'Total HTTP requests handled, by route and status class.',
  labelNames: ['route', 'status'] as const,
  registers: [registry],
});

export const requestDuration = new Histogram({
  name: 'copilot_request_duration_seconds',
  help: 'End-to-end request duration, sliced by retrieval path and model arm.',
  labelNames: ['route', 'path', 'model'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16],
  registers: [registry],
});

export const retrievalHits = new Histogram({
  name: 'copilot_retrieval_hits',
  help: 'Evidence items returned per retrieval, by path. Zero means the floor was hit.',
  labelNames: ['path'] as const,
  buckets: [0, 1, 2, 3, 5, 8],
  registers: [registry],
});

export const groundingFailures = new Counter({
  name: 'copilot_grounding_failures_total',
  help: 'Grounding-gate trips, by reason. The key quality signal.',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const rlReward = new Gauge({
  name: 'copilot_rl_reward',
  help: 'Running mean reward per bandit arm.',
  labelNames: ['state', 'action'] as const,
  registers: [registry],
});

export const rlPulls = new Counter({
  name: 'copilot_rl_pulls_total',
  help: 'Arm pulls, labelled by whether the draw was exploratory.',
  labelNames: ['state', 'action', 'exploring'] as const,
  registers: [registry],
});

export const dependencyUp = new Gauge({
  name: 'copilot_dependency_up',
  help: 'Dependency reachability: 1 up, 0.5 degraded, 0 down.',
  labelNames: ['dependency'] as const,
  registers: [registry],
});

export function recordDependency(name: string, status: 'up' | 'degraded' | 'down'): void {
  dependencyUp.set({ dependency: name }, status === 'up' ? 1 : status === 'degraded' ? 0.5 : 0);
}

/** Status class bucketing keeps cardinality flat (2xx/4xx/5xx). */
export function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}
