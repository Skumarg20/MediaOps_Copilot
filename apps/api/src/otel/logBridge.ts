import { Writable } from 'node:stream';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import { SeverityNumber, logs, type AnyValue } from '@opentelemetry/api-logs';
import { config } from '@/config.js';

const SEVERITY_BY_PINO_LEVEL: Record<string, SeverityNumber> = {
	trace: SeverityNumber.TRACE,
	debug: SeverityNumber.DEBUG,
	info: SeverityNumber.INFO,
	warn: SeverityNumber.WARN,
	error: SeverityNumber.ERROR,
	fatal: SeverityNumber.FATAL
};

/** Envelope fields pino always writes; everything else is a real log attribute. */
const PINO_ENVELOPE_KEYS = new Set(['level', 'ts', 'time', 'msg', 'service', 'version']);

/** Returns null for anything that is not a pino JSON line, rather than throwing into a write. */
function parsePinoLine(chunk: unknown): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(String(chunk));
		return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/**
 * A pino stream that forwards every line to the OpenTelemetry Logs API.
 *
 * Written by hand rather than left to `@opentelemetry/instrumentation-pino`,
 * which patches the `pino` factory as the module is required. That hook never
 * fires here: pino is imported directly from ESM, so the ESM loader translates
 * it instead of passing through the CJS require the instrumentation watches.
 * Measured rather than assumed — with the instrumentation alone, no log records
 * were exported and no `trace_id` was injected, while `pg` and `knex`, required
 * transitively as CJS, were instrumented normally.
 *
 * Bridging at the stream covers every pino call, including the boot lines
 * written through `logger.info` rather than `logEvent`.
 */
export function createOtelLogStream(): Writable {
	const otelLogger = logs.getLogger(config.otel.serviceName, config.otel.serviceVersion);

	return new Writable({
		write(chunk, _encoding, callback) {
			const record = parsePinoLine(chunk);

			if (record) {
				const level = typeof record.level === 'string' ? record.level : 'info';
				const attributes: Record<string, AnyValue> = {};
				for (const [key, value] of Object.entries(record)) {
					if (!PINO_ENVELOPE_KEYS.has(key)) attributes[key] = value as AnyValue;
				}

				otelLogger.emit({
					severityNumber: SEVERITY_BY_PINO_LEVEL[level] ?? SeverityNumber.INFO,
					severityText: level,
					body: typeof record.msg === 'string' ? record.msg : String(record.event ?? ''),
					attributes
				});
			}

			callback();
		}
	});
}

/**
 * A pino mixin that stamps the active trace onto every line.
 *
 * Exported records are correlated by the SDK from the active context, so this
 * exists for the other half: the JSON on stdout, which is what an operator
 * actually reads during an incident, and which is useless for jumping to a trace
 * unless the ids are in the line.
 */
export function otelTraceContextMixin(): Record<string, string> {
	const spanContext = trace.getActiveSpan()?.spanContext();
	if (!spanContext || !isSpanContextValid(spanContext)) return {};

	return {
		trace_id: spanContext.traceId,
		span_id: spanContext.spanId,
		trace_flags: spanContext.traceFlags.toString(16)
	};
}
