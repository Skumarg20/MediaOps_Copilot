import { logs, SeverityNumber, type LogRecord } from '@opentelemetry/api-logs';
import { describe, expect, it, vi } from 'vitest';
import { createOtelLogStream, otelTraceContextMixin } from '@/otel/logBridge.js';

/**
 * The bridge exists because `@opentelemetry/instrumentation-pino` never patches
 * pino here — it hooks CJS `require`, and pino is imported directly from ESM.
 * These tests pin the translation it performs in the instrumentation's place.
 */
function captureEmittedRecords(): { records: LogRecord[]; restore: () => void } {
	const records: LogRecord[] = [];
	const spy = vi.spyOn(logs, 'getLogger').mockReturnValue({
		emit: (record: LogRecord) => records.push(record)
	} as ReturnType<typeof logs.getLogger>);

	return { records, restore: () => spy.mockRestore() };
}

function writeLine(line: string): LogRecord[] {
	const { records, restore } = captureEmittedRecords();
	const stream = createOtelLogStream();
	stream.write(line);
	restore();
	return records;
}

describe('pino to OpenTelemetry log bridge', () => {
	it('maps every pino level onto the matching OTel severity', () => {
		const cases: Array<[string, SeverityNumber]> = [
			['trace', SeverityNumber.TRACE],
			['debug', SeverityNumber.DEBUG],
			['info', SeverityNumber.INFO],
			['warn', SeverityNumber.WARN],
			['error', SeverityNumber.ERROR],
			['fatal', SeverityNumber.FATAL]
		];

		for (const [level, expected] of cases) {
			const [record] = writeLine(JSON.stringify({ level, msg: 'x' }));
			expect(record?.severityNumber).toBe(expected);
			expect(record?.severityText).toBe(level);
		}
	});

	it('falls back to INFO for a level it does not recognise', () => {
		const [record] = writeLine(JSON.stringify({ level: 'silly', msg: 'x' }));
		expect(record?.severityNumber).toBe(SeverityNumber.INFO);
	});

	it('promotes domain fields to attributes and drops the pino envelope', () => {
		const [record] = writeLine(
			JSON.stringify({
				level: 'info',
				ts: '2026-08-20T00:00:00.000Z',
				service: 'mediaops-copilot-api',
				version: '1.0.0',
				msg: 'retrieved',
				event: 'retrieval.completed',
				transaction_id: 'tx-1',
				hits: 3
			})
		);

		expect(record?.attributes).toMatchObject({
			event: 'retrieval.completed',
			transaction_id: 'tx-1',
			hits: 3
		});
		// Envelope fields are carried by the record itself, not duplicated as attributes.
		for (const key of ['level', 'ts', 'msg', 'service', 'version']) {
			expect(record?.attributes).not.toHaveProperty(key);
		}
	});

	it('uses the event name as the body when a line carries no message', () => {
		const [record] = writeLine(JSON.stringify({ level: 'warn', event: 'grounding.failed' }));
		expect(record?.body).toBe('grounding.failed');
	});

	it('swallows a line that is not pino JSON rather than failing the write', () => {
		const { records, restore } = captureEmittedRecords();
		const stream = createOtelLogStream();

		expect(() => stream.write('not json at all\n')).not.toThrow();
		expect(() => stream.write('null')).not.toThrow();

		restore();
		expect(records).toHaveLength(0);
	});
});

describe('trace context mixin', () => {
	it('returns nothing when no span is active, so lines stay clean', () => {
		expect(otelTraceContextMixin()).toEqual({});
	});
});
