import '@/otel/bootstrap.js';
import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { config } from '@/config.js';
import { closeDb } from '@/connections/index.js';
import { buildContext } from '@/context.js';
import { feedbackRouter, feedbackRoutes } from '@/modules/feedback/index.js';
import { healthRouter, healthRoutes, metricsRoutes } from '@/modules/health/index.js';
import { queryRouter, queryRoutes } from '@/modules/query/index.js';
import { rlRouter, rlRoutes } from '@/modules/rl/index.js';
import { transactionRouter, transactionRoutes } from '@/modules/transaction/index.js';
import { otelMiddleware, shutdownTelemetry } from '@/otel/index.js';
import { router } from '@/trpc.js';
import { logEvent, logger, requestsTotal, statusClass } from '@/utils/index.js';

export const appRouter = router({
	query: queryRouter,
	feedback: feedbackRouter,
	transaction: transactionRouter,
	rl: rlRouter,
	health: healthRouter
});

export type AppRouter = typeof appRouter;

/**
 * How long a shutdown waits for in-flight connections before exiting hard, kept
 * under a typical orchestrator grace period so a hung connection cannot hold the
 * container open past it.
 */
const FORCED_EXIT_AFTER_GRACE_MS = 5_000;

/** Comfortably above the largest legitimate body: a 2000-character query. */
const MAX_REQUEST_BYTES = 64 * 1024;

/**
 * Builds the Hono app.
 *
 * CORS is wide open because this is a single-operator console and auth is out of
 * scope for this build. Authentication belongs here, in front of all routes,
 * with /health and /metrics moved to a separate internal listener.
 */
export function createApp(): Hono {
	const app = new Hono();

	app.use(
		cors({
			origin: '*',
			allowMethods: ['GET', 'POST', 'OPTIONS']
		})
	);

	/**
	 * A query is capped at 2000 characters, but zod only sees the body after it
	 * has been read into memory. This caps it before that, so an oversized POST
	 * costs a 413 rather than a buffer the size of whatever was sent.
	 */
	app.use('*', bodyLimit({ maxSize: MAX_REQUEST_BYTES, onError: (c) => c.json({ error: 'payload_too_large' }, 413) }));

	app.use('*', otelMiddleware());

	app.use('*', async (c, next) => {
		const started = Date.now();
		await next();
		const route = new URL(c.req.url).pathname;
		requestsTotal.inc({ route, status: statusClass(c.res.status) });
		logEvent(logger, c.res.status >= 500 ? 'error' : 'info', 'http.request', {
			method: c.req.method,
			route,
			status: c.res.status,
			ms: Date.now() - started
		});
	});

	app.onError((error, c) => {
		if (error instanceof HTTPException) {
			return c.json({ error: error.message }, error.status);
		}

		logger.error({ event: 'http.request', error }, 'unhandled error');
		return c.json({ error: 'Internal server error' }, 500);
	});

	app.use(
		'/trpc/*',
		trpcServer({
			router: appRouter,
			createContext: ({ req }) => ({
				distinctId: req.headers.get('x-distinct-id') ?? undefined,
				operatorKey: req.headers.get('x-operator-key') ?? undefined
			})
		})
	);

	app.route('/query', queryRoutes);
	app.route('/feedback', feedbackRoutes);
	app.route('/transactions', transactionRoutes);
	app.route('/rl', rlRoutes);
	app.route('/health', healthRoutes);
	app.route('/metrics', metricsRoutes);

	app.get('/', (c) =>
		c.json({
			service: 'mediaops-copilot-api',
			version: config.version,
			routes: ['/query', '/feedback', '/transactions', '/rl/stats', '/health', '/metrics', '/trpc/*']
		})
	);

	app.notFound((c) => c.json({ error: 'not_found', path: new URL(c.req.url).pathname }, 404));

	return app;
}

/**
 * A rejection nobody caught kills the process on Node 20 by default, and it does
 * it with a bare stack on stderr — outside the JSON stream, uncorrelated, and
 * invisible to anything reading the logs. Logging it in the house format first
 * is the difference between "the container restarted" and knowing why.
 *
 * The process still exits. Continuing after an unknown failure would leave the
 * service in a state nothing has reasoned about.
 */
function logFatal(kind: 'unhandledRejection' | 'uncaughtException', error: unknown): void {
	logger.error({ event: 'boot.failed', kind, error }, 'fatal: unhandled error');
	setTimeout(() => process.exit(1), 100).unref();
}
async function main(): Promise<void> {
	await buildContext();
	const app = createApp();

	const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
		logger.info(
			{ event: 'boot.listening', port: info.port, version: config.version, env: config.env },
			'mediaops-copilot api listening'
		);
	});

	const shutdown = (signal: string) => {
		logger.info({ event: 'boot.shutdown', signal }, 'shutting down');
		server.close(() => {
			void shutdownTelemetry()
				.then(() => closeDb())
				.finally(() => process.exit(0));
		});
		setTimeout(() => process.exit(1), FORCED_EXIT_AFTER_GRACE_MS).unref();
	};

	process.on('unhandledRejection', (reason) => logFatal('unhandledRejection', reason));
	process.on('uncaughtException', (error) => logFatal('uncaughtException', error));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
}

const runningUnderVitest = process.env.VITEST === 'true';

if (!runningUnderVitest) {
	main().catch((error) => {
		logger.error({ event: 'boot.failed', error }, 'failed to start');
		process.exit(1);
	});
}
