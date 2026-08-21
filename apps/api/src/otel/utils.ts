import { SpanStatusCode, type Span } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

export function setSpanWithError(span: Span, error: Error): void {
	span.setAttribute(ATTR_ERROR_TYPE, error.name);
	span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
	span.recordException(error);
}
