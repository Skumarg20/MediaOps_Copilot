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

const PINO_ENVELOPE_KEYS = new Set(['level', 'ts', 'time', 'msg', 'service', 'version']);

function parsePinoLine(chunk: unknown): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(String(chunk));
		return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

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

export function otelTraceContextMixin(): Record<string, string> {
	const spanContext = trace.getActiveSpan()?.spanContext();
	if (!spanContext || !isSpanContextValid(spanContext)) return {};

	return {
		trace_id: spanContext.traceId,
		span_id: spanContext.spanId,
		trace_flags: spanContext.traceFlags.toString(16)
	};
}
