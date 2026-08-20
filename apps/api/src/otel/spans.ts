import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { config } from '@/config.js';
import { setSpanWithError } from './utils.js';

/**
 * Runs `fn` inside a child span of whatever is currently active.
 *
 * The answer path is a chain of decisions rather than a chain of HTTP calls, so
 * a request-level span alone would show latency without showing where it went.
 * Wrapping each stage is what turns a trace into the same story the rationale
 * panel tells: which path was chosen, what it retrieved, whether it was grounded.
 */
export async function withSpan<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
	const tracer = trace.getTracer(config.otel.serviceName, config.otel.serviceVersion);

	return tracer.startActiveSpan(name, { attributes }, async (span) => {
		try {
			const result = await fn();
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			if (error instanceof Error) setSpanWithError(span, error);
			throw error;
		} finally {
			span.end();
		}
	});
}

/**
 * Adds attributes to the stage span currently in scope, for facts that are only
 * known after the stage has run — the chosen arm, the evidence count, the band.
 */
export function annotateActiveSpan(attributes: Attributes): void {
	trace.getActiveSpan()?.setAttributes(attributes);
}
