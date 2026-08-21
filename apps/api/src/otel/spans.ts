import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { config } from '@/config.js';
import { setSpanWithError } from './utils.js';

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

export function annotateActiveSpan(attributes: Attributes): void {
	trace.getActiveSpan()?.setAttributes(attributes);
}
