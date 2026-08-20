import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

/**
 * Marks a span as failed and attaches the exception.
 *
 * Recording the exception as well as the status means a trace backend can show
 * the stack next to the failed span rather than only that something went wrong.
 */
export function setSpanWithError(span: Span, error: Error): void {
	span.setAttribute(ATTR_ERROR_TYPE, error.name);
	span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
	span.recordException(error);
}
