import { Hono } from 'hono';
import { publicProcedure, router } from '@/trpc.js';
import { registry } from '@/utils/index.js';
import { healthService } from './services/index.js';

export const healthRoutes = new Hono();

healthRoutes.get('/', async (c) => {
	const report = await healthService.checkHealth();
	return c.json(report, report.status === 'down' ? 503 : 200);
});

export const metricsRoutes = new Hono();

metricsRoutes.get('/', async (c) => {
	return c.text(await registry.metrics(), 200, { 'content-type': registry.contentType });
});

export const healthRouter = router({
	check: publicProcedure.query(async () => healthService.checkHealth())
});
