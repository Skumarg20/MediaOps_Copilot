import pino from 'pino';
import { config } from '@/config.js';

/**
 * Event names are a closed vocabulary so dashboards and alerts can be built on
 * stable keys rather than log-message regexes.
 */
export type LogEvent =
  | 'http.request'
  | 'triage.classified'
  | 'router.decided'
  | 'bandit.selected'
  | 'bandit.masked'
  | 'retrieval.completed'
  | 'retrieval.floor_miss'
  | 'agent.step'
  | 'agent.budget_exhausted'
  | 'agent.degraded'
  | 'tool.invoked'
  | 'tool.mutation_simulated'
  | 'grounding.passed'
  | 'grounding.failed'
  | 'rl.pull'
  | 'rl.updated'
  | 'dep.probe'
  | 'dep.circuit_open'
  | 'dep.circuit_closed'
  | 'boot.indexed'
  | 'boot.seeded';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'mediaops-copilot-api', version: config.version },
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export type Logger = pino.Logger;

/**
 * One child logger per request, so every downstream layer inherits the
 * transaction_id and grepping a single ID replays the whole decision path.
 */
export function childLogger(transactionId: string): Logger {
  return logger.child({ transaction_id: transactionId });
}

/** Typed helper that keeps the `event` key mandatory and spelled correctly. */
export function logEvent(
  log: Logger,
  level: 'info' | 'warn' | 'error' | 'debug',
  event: LogEvent,
  fields: Record<string, unknown> = {},
): void {
  log[level]({ event, ...fields });
}
