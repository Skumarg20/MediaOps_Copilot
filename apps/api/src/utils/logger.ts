import pino from 'pino';
import { config } from '@/config.js';
import { createOtelLogStream, otelTraceContextMixin } from '@/otel/logBridge.js';

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
  | 'boot.seeded'
  | 'boot.listening'
  | 'boot.shutdown'
  | 'boot.failed';

const destination = config.otel.enabled
  ? pino.multistream([
      { level: 'trace', stream: process.stdout },
      { level: 'trace', stream: createOtelLogStream() },
    ])
  : process.stdout;

export const logger = pino(
  {
    level: config.logLevel,
    base: { service: 'mediaops-copilot-api', version: config.version },
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label }),
    },
    mixin: otelTraceContextMixin,
  },
  destination,
);

export type Logger = pino.Logger;

export function childLogger(transactionId: string): Logger {
  return logger.child({ transaction_id: transactionId });
}

export function logEvent(
  log: Logger,
  level: 'info' | 'warn' | 'error' | 'debug',
  event: LogEvent,
  fields: Record<string, unknown> = {},
): void {
  log[level]({ event, ...fields });
}
