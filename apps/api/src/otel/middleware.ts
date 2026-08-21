import { SpanKind, context, metrics, propagation, trace } from '@opentelemetry/api';
import {
	ATTR_HTTP_REQUEST_METHOD,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_HTTP_ROUTE,
	ATTR_URL_FULL,
	ATTR_URL_PATH,
	ATTR_URL_SCHEME
} from '@opentelemetry/semantic-conventions';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { config } from '@/config.js';
import { createHttpServerMetrics, observeHttpServerMetrics } from './metrics.js';
import { setSpanWithError } from './utils.js';

export function otelMiddleware(): MiddlewareHandler {
	const tracer = trace.getTracer(config.otel.serviceName, config.otel.serviceVersion);
	const meter = metrics.getMeter(config.otel.serviceName, config.otel.serviceVersion);
	const httpMetrics = createHttpServerMetrics(meter);

	return createMiddleware(async (c, next) => {
		const incomingTraceContext = c.req.header('traceparent')
			? propagation.extract(context.active(), c.req.header())
			: context.active();

		const startedAt = performance.now();
		const url = new URL(c.req.url);

		await tracer.startActiveSpan(
			`${c.req.method} ${c.req.routePath}`,
			{
				kind: SpanKind.SERVER,
				attributes: {
					[ATTR_HTTP_REQUEST_METHOD]: c.req.method,
					[ATTR_URL_FULL]: url.href,
					[ATTR_URL_PATH]: url.pathname,
					[ATTR_URL_SCHEME]: url.protocol.slice(0, -1),
					[ATTR_HTTP_ROUTE]: c.req.routePath
				}
			},
			incomingTraceContext,
			async (span) => {
				try {
					await next();
					span.updateName(`${c.req.method} ${c.req.routePath}`);
					span.setAttribute(ATTR_HTTP_ROUTE, c.req.routePath);
					span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, c.res.status);
					if (c.error) setSpanWithError(span, c.error);
				} catch (error) {
					if (error instanceof Error) setSpanWithError(span, error);
					throw error;
				} finally {
					span.end();
					observeHttpServerMetrics(httpMetrics, c, { startedAt });
				}
			}
		);
	});
}
