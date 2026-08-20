import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
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

export function createApp(): Hono {
	const app = new Hono();

	// Single-operator console; auth is out of scope for this build. The natural
	// insertion point is here, in front of all routes, with /health and /metrics
	// moved to a separate internal listener.
	app.use(
		cors({
			origin: '*',
			allowMethods: ['GET', 'POST', 'OPTIONS']
		})
	);

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

async function main(): Promise<void> {
	await buildContext();
	const app = createApp();

	const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
		logger.info(
			{ event: 'boot.seeded', port: info.port, version: config.version, env: config.env },
			'mediaops-copilot api listening'
		);
	});

	const shutdown = (signal: string) => {
		logger.info({ event: 'boot.seeded', signal }, 'shutting down');
		server.close(() => {
			void closeDb().finally(() => process.exit(0));
		});
		// Don't let a hung connection hold the container open past the
		// orchestrator's own grace period.
		setTimeout(() => process.exit(1), 5_000).unref();
	};

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
}

// Only boot when run directly, so tests can import `createApp` without starting
// a listener or touching the network.
if (process.env.VITEST !== 'true') {
	main().catch((error) => {
		logger.error({ event: 'boot.seeded', error }, 'failed to start');
		process.exit(1);
	});
}
