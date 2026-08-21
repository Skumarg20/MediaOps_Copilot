import { ValueType, type Counter, type Histogram, type Meter } from '@opentelemetry/api';
import {
	ATTR_HTTP_REQUEST_METHOD,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_HTTP_ROUTE
} from '@opentelemetry/semantic-conventions';
import type { Context } from 'hono';

export type HttpServerMetrics = {
	requestDuration: Histogram;
	requestsTotal: Counter;
};

export function createHttpServerMetrics(meter: Meter): HttpServerMetrics {
	const requestDuration = meter.createHistogram('http.server.request.duration', {
		description: 'Duration of HTTP requests in seconds',
		unit: 's',
		valueType: ValueType.DOUBLE
	});

	const requestsTotal = meter.createCounter('http.server.requests', {
		description: 'Total number of HTTP requests',
		valueType: ValueType.INT
	});

	return { requestDuration, requestsTotal };
}

export function observeHttpServerMetrics(
	instruments: HttpServerMetrics,
	c: Context,
	options: { startedAt: number }
): void {
	const durationSeconds = (performance.now() - options.startedAt) / 1000;

	const attributes = {
		[ATTR_HTTP_REQUEST_METHOD]: c.req.method,
		[ATTR_HTTP_RESPONSE_STATUS_CODE]: c.res.status,
		[ATTR_HTTP_ROUTE]: c.req.routePath
	};

	instruments.requestDuration.record(durationSeconds, attributes);
	instruments.requestsTotal.add(1, attributes);
}
