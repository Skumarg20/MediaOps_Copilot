import type { Hono } from 'hono';
import type { Knex } from 'knex';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setDb } from '@/connections/index.js';
import { FakeLlmAdapter } from '@/connections/llmFake.js';
import { buildContext, setContext, type AppContext } from '@/context.js';
import { createApp } from '@/index.js';
import type { QueryResponse } from '@/types.js';
import { createTestDb, destroyTestDb, isPostgresAvailable, skipReason } from './helpers/db.js';

const hasPostgres = await isPostgresAvailable();

describe.skipIf(!hasPostgres)('api', () => {
	let db: Knex;
	let app: Hono;
	let ctx: AppContext;

	beforeAll(async () => {
		db = await createTestDb('api');
		setDb(db);
		app = createApp();
	});

	afterAll(async () => {
		setContext(null);
		await destroyTestDb(db);
	});

	/**
	 * A fresh context and empty learned state per test, so a bandit mean or a
	 * transaction count from one case can never explain another's result.
	 */
	async function useContext(opts: { llm?: FakeLlmAdapter; epsilon?: number } = {}): Promise<AppContext> {
		await db('copilot.citation').del();
		await db('copilot.feedback').del();
		await db('copilot.toolInvocation').del();
		await db('copilot.transaction').del();
		await db('copilot.banditArm').del();

		ctx = await buildContext({
			llm: opts.llm ?? new FakeLlmAdapter(),
			// Pin exploitation so route assertions are not flaky on an ε draw.
			bandit: { epsilonOverride: opts.epsilon ?? 0, random: () => 0, trx: db }
		});
		return ctx;
	}

	afterEach(() => {
		setContext(null);
	});

	async function ask(query: string): Promise<{ status: number; body: QueryResponse }> {
		const res = await app.request('/query', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query })
		});
		return { status: res.status, body: (await res.json()) as QueryResponse };
	}

	async function rate(transactionId: string, score: 0 | 1 | -1) {
		return app.request('/feedback', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ transaction_id: transactionId, score })
		});
	}

	describe('POST /query — contract', () => {
		it('returns every field the contract promises', async () => {
			await useContext();
			const { status, body } = await ask('what does error code RENDER_TIMEOUT mean');

			expect(status).toBe(200);
			expect(body).toMatchObject({
				retrieval_path: expect.any(String),
				llm_used: expect.any(String),
				latency_ms: expect.any(Number),
				grounded: expect.any(Boolean),
				degraded: expect.any(Boolean)
			});
			expect(body.transaction_id).toMatch(/^[0-9a-f-]{36}$/);
			expect(['low', 'medium', 'high']).toContain(body.hallucination_risk);
			expect(Array.isArray(body.citations)).toBe(true);
		});

		it('pins the vectorless path for a known error code', async () => {
			await useContext();
			const { body } = await ask('what does error code RENDER_TIMEOUT mean');

			expect(body.retrieval_path).toBe('vectorless');
			expect(body.rationale.path.deterministic).toBe(true);
			expect(body.rationale.path.why).toMatch(/RENDER_TIMEOUT/);
			expect(body.citations.map((citation) => citation.id)).toContain('errorCode:RENDER_TIMEOUT');
		});

		it('pins the vectorless path for a known job id', async () => {
			await useContext();
			const { body } = await ask('why did job 482 fail');

			expect(body.retrieval_path).toBe('vectorless');
			expect(body.rationale.path.deterministic).toBe(true);
			expect(body.citations.some((citation) => citation.id === 'job:482')).toBe(true);
		});

		it('leaves the path to the bandit when no anchor resolves', async () => {
			await useContext();
			const { body } = await ask('why is my render slower than usual');

			expect(body.rationale.path.deterministic).toBe(false);
			expect(['vector', 'vectorless']).toContain(body.retrieval_path);
		});

		it('abstains with 200 rather than erroring when nothing clears the floor', async () => {
			await useContext();
			const { status, body } = await ask('zxqv plorbnat wibble frotz');

			// "I don't know" is a correct answer and must flow through the same path.
			expect(status).toBe(200);
			expect(body.grounded).toBe(false);
			expect(body.answer).toMatch(/don't know/i);
			expect(body.hallucination_risk).toBe('high');
			expect(body.citations).toHaveLength(0);
		});

		it('rejects an empty query with field-level detail', async () => {
			await useContext();
			const res = await app.request('/query', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: '   ' })
			});

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string; details: Array<{ field: string }> };
			expect(body.error).toBe('invalid_request');
			expect(body.details[0]?.field).toBe('query');
		});

		it('rejects a wrongly typed body', async () => {
			await useContext();
			const res = await app.request('/query', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: 42 })
			});
			expect(res.status).toBe(400);
		});

		it('rejects a malformed body without crashing', async () => {
			await useContext();
			const res = await app.request('/query', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: 'not json at all'
			});
			expect(res.status).toBe(400);
		});
	});

	describe('the rationale contract — the seam most likely to rot', () => {
		it('emits exactly the shape the console destructures', async () => {
			await useContext();
			const { body } = await ask('what does error code RENDER_TIMEOUT mean');
			const rationale = body.rationale;

			expect(Object.keys(rationale).sort()).toEqual(['confidence', 'evidence', 'model', 'path', 'triage']);
			expect(Object.keys(rationale.path).sort()).toEqual(['chosen', 'deterministic', 'why']);
			expect(Object.keys(rationale.model).sort()).toEqual([
				'arm_mean_reward',
				'arm_pulls',
				'chosen',
				'exploring',
				'why'
			]);
			expect(Object.keys(rationale.confidence).sort()).toEqual(['band', 'why']);
			expect(Object.keys(rationale.triage).sort()).toEqual(['class', 'why']);
			expect(['High', 'Medium', 'Low']).toContain(rationale.confidence.band);
			for (const item of rationale.evidence) {
				expect(Object.keys(item).sort()).toEqual(['excerpt', 'id']);
			}
		});

		it('survives the jsonb round-trip through Postgres unchanged', async () => {
			await useContext();
			const { body } = await ask('why did job 482 fail');

			const res = await app.request('/transactions?limit=1');
			const listed = (await res.json()) as { transactions: Array<{ rationale: unknown }> };

			// The console reads the stored copy, not the response — if jsonb
			// mangled it, the panel would render from a different object.
			expect(listed.transactions[0]?.rationale).toEqual(body.rationale);
		});

		it('explains each decision in terms an operator can act on', async () => {
			await useContext();
			const { body } = await ask('what does error code RENDER_TIMEOUT mean');
			const rationale = body.rationale;

			expect(rationale.path.why.length).toBeGreaterThan(10);
			expect(rationale.model.why).toMatch(/exploit|explore|unavailable/i);
			expect(rationale.confidence.why.length).toBeGreaterThan(10);
			expect(rationale.triage.why).toMatch(/flagged by|no feature/i);
		});

		it('names exploration explicitly so an experiment is never mistaken for a verdict', async () => {
			await useContext({ epsilon: 1 });
			const { body } = await ask('how do I safely retry a stuck job');

			expect(body.rationale.model.exploring).toBe(true);
			expect(body.rationale.model.why).toMatch(/explore/i);
		});
	});

	describe('POST /feedback — the learning path', () => {
		it('computes a reward and folds it into the arm', async () => {
			await useContext();
			const { body: query } = await ask('what does error code RENDER_TIMEOUT mean');

			const res = await rate(query.transaction_id, 1);
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				reward: number;
				arm: string;
				arm_mean_reward: number;
				arm_pulls: number;
			};

			expect(body.arm).toBe(`${query.retrieval_path}|${query.llm_used}`);
			expect(body.reward).toBeCloseTo(10 - query.latency_ms / 1000, 2);
			expect(body.arm_pulls).toBeGreaterThanOrEqual(1);
			// Returning the recomputed stats is what makes this a loop, not a button.
			expect(body.arm_mean_reward).toBeCloseTo(body.reward, 2);
		});

		it('moves the arm mean downward on an unhelpful (0) rating', async () => {
			await useContext();
			const { body: query } = await ask('why did job 482 fail');

			const body = (await (await rate(query.transaction_id, 0)).json()) as {
				reward: number;
				arm_mean_reward: number;
			};

			expect(body.reward).toBeLessThan(0);
			expect(body.arm_mean_reward).toBeLessThan(5); // below the optimistic prior
		});

		it('returns 404 for an unknown transaction', async () => {
			await useContext();
			const res = await rate('00000000-0000-4000-8000-0000000000ff', 1);
			expect(res.status).toBe(404);
		});

		it('returns 409 on a duplicate rating and leaves the policy untouched', async () => {
			await useContext();
			const { body: query } = await ask('what does error code UPLOAD_TIMEOUT mean');

			const first = await rate(query.transaction_id, 1);
			expect(first.status).toBe(200);
			const firstBody = (await first.json()) as { arm_mean_reward: number };

			expect((await rate(query.transaction_id, 1)).status).toBe(409);

			// Match on state as well as arm: the same arm key exists in all three
			// states, and only this query's state was updated.
			const stats = (await ctx.bandit.snapshot()).find(
				(arm) =>
					arm.state === query.rationale.triage.class &&
					arm.action === `${query.retrieval_path}|${query.llm_used}`
			);
			expect(stats?.meanReward).toBeCloseTo(firstBody.arm_mean_reward, 3);
		});

		it('accepts the binary contract the interface specifies: 1 = helpful, 0 = unhelpful', async () => {
			// The spec fixes these two values. Rejecting 0 would 400 every
			// "unhelpful" rating a conformant client ever sent.
			await useContext();

			const helpful = await ask('what does error code RENDER_TIMEOUT mean');
			expect((await rate(helpful.body.transaction_id, 1)).status).toBe(200);

			const unhelpful = await ask('why did job 482 fail');
			const res = await rate(unhelpful.body.transaction_id, 0);
			expect(res.status).toBe(200);

			// Reward = (0 × 10) − latency − penalty, so an unhelpful rating is
			// negative without needing a -1 anywhere in the contract.
			const body = (await res.json()) as { reward: number };
			expect(body.reward).toBeLessThan(0);
			expect(body.reward).toBeCloseTo(-unhelpful.body.latency_ms / 1000, 2);
		});

		it('normalises a legacy -1 to 0 rather than rejecting it', async () => {
			await useContext();
			const { body: query } = await ask('why did job 482 fail');

			const res = await rate(query.transaction_id, -1);
			expect(res.status).toBe(200);

			// Same reward as an explicit 0 — the alias changes nothing downstream.
			const body = (await res.json()) as { reward: number };
			expect(body.reward).toBeCloseTo(-query.latency_ms / 1000, 2);
		});

		it('rejects a score outside the binary contract', async () => {
			await useContext();
			const { body: query } = await ask('why did job 482 fail');
			const res = await app.request('/feedback', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ transaction_id: query.transaction_id, score: 5 })
			});
			expect(res.status).toBe(400);
		});

		it('charges the hallucination penalty into the reward of an abstention', async () => {
			await useContext();
			const { body: query } = await ask('zxqv plorbnat wibble frotz');
			expect(query.grounded).toBe(false);

			const body = (await (await rate(query.transaction_id, 1)).json()) as { reward: number };
			// 10 − latency − 5: even a thumbs-up cannot fully excuse an ungrounded answer.
			expect(body.reward).toBeLessThan(6);
		});
	});

	describe('failure modes — degradation, not crashes', () => {
		it('answers from the structured record when Ollama is unreachable', async () => {
			await useContext({ llm: new FakeLlmAdapter({ generationDown: true }) });
			const { status, body } = await ask('why did job 482 fail');

			expect(status).toBe(200);
			expect(body.degraded).toBe(true);
			expect(body.retrieval_path).toBe('vectorless');
			// Narrower, but strictly more verifiable: it is the record itself.
			expect(body.grounded).toBe(true);
			expect(body.citations.some((citation) => citation.id === 'job:482')).toBe(true);
			expect(body.rationale.model.why).toMatch(/unavailable|unreachable|failed/i);
		});

		it('forces the vectorless path when the vector index is empty', async () => {
			await useContext({ llm: new FakeLlmAdapter({ embeddingDown: true }) });
			const { status, body } = await ask('how do I safely retry a stuck job');

			expect(status).toBe(200);
			expect(body.retrieval_path).toBe('vectorless');
			expect(body.rationale.path.deterministic).toBe(true);
			expect(body.rationale.path.why).toMatch(/unavailable|degraded|floor/i);
		});

		it('still records a transaction when the model runtime is down', async () => {
			await useContext({ llm: new FakeLlmAdapter({ generationDown: true }) });
			await ask('why did job 482 fail');

			const body = (await (await app.request('/transactions?limit=10')).json()) as { count: number };
			// Learning must not stop just because generation did.
			expect(body.count).toBe(1);
		});
	});

	describe('supporting routes', () => {
		it('feeds the console the transactions it needs', async () => {
			await useContext();
			await ask('what does error code RENDER_TIMEOUT mean');
			await ask('why did job 482 fail');

			const res = await app.request('/transactions?limit=10');
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				count: number;
				transactions: Array<{ rationale: unknown; citations: unknown[]; feedback: unknown }>;
			};
			expect(body.count).toBe(2);
			expect(body.transactions[0]?.rationale).toBeTruthy();
			expect(body.transactions[0]?.feedback).toBeNull();
		});

		it('rejects an out-of-range limit', async () => {
			await useContext();
			expect((await app.request('/transactions?limit=9999')).status).toBe(400);
		});

		it('exposes per-arm stats and a reward series for the RL panel', async () => {
			await useContext();
			const { body: query } = await ask('what does error code RENDER_TIMEOUT mean');
			await rate(query.transaction_id, 1);

			const body = (await (await app.request('/rl/stats')).json()) as {
				arms: Array<{ pulls: number; mean_reward: number; pull_share: number }>;
				total_pulls: number;
				series: Array<{ reward: number }>;
			};

			expect(body.arms).toHaveLength(12); // 3 states × 4 arms
			expect(body.total_pulls).toBeGreaterThanOrEqual(1);
			expect(body.series).toHaveLength(1);
		});

		it('probes real dependencies rather than returning a hardcoded 200', async () => {
			await useContext();
			const res = await app.request('/health');
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				status: string;
				checks: Record<string, { status: string }>;
				uptime_s: number;
			};
			expect(body.checks.postgres?.status).toBe('up');
			expect(body.checks.vector_index).toBeDefined();
			expect(body.checks.ollama_generation).toBeDefined();
			expect(typeof body.uptime_s).toBe('number');
		});

		it('reports degraded — but still serves — when a dependency is down', async () => {
			await useContext({ llm: new FakeLlmAdapter({ embeddingDown: true }) });
			const res = await app.request('/health');
			const body = (await res.json()) as { status: string };

			// A degraded instance keeps serving vectorless answers; only a dead one
			// should be shed by a load balancer.
			expect(res.status).toBe(200);
			expect(body.status).toBe('degraded');
		});

		it('exposes the metrics the runbook depends on', async () => {
			await useContext();
			await ask('what does error code RENDER_TIMEOUT mean');

			const text = await (await app.request('/metrics')).text();
			for (const metric of [
				'copilot_requests_total',
				'copilot_request_duration_seconds',
				'copilot_retrieval_hits',
				'copilot_rl_reward',
				'copilot_rl_pulls_total',
				'copilot_dependency_up'
			]) {
				expect(text).toContain(metric);
			}
		});

		it('404s an unknown route as JSON', async () => {
			await useContext();
			const res = await app.request('/nope');
			expect(res.status).toBe(404);
			expect((await res.json()) as { error: string }).toMatchObject({ error: 'not_found' });
		});
	});

	describe('tRPC surface', () => {
		it('answers through the same service the REST route uses', async () => {
			await useContext();
			const res = await app.request('/trpc/query.ask', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: 'what does error code RENDER_TIMEOUT mean' })
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { result: { data: QueryResponse } };
			expect(body.result.data.retrieval_path).toBe('vectorless');
			expect(body.result.data.rationale.path.deterministic).toBe(true);
		});

		it('serves the console feed with the same shape as the REST route', async () => {
			await useContext();
			await ask('why did job 482 fail');

			const res = await app.request('/trpc/transaction.list?input=' + encodeURIComponent(JSON.stringify({ limit: 5 })));
			expect(res.status).toBe(200);

			const body = (await res.json()) as { result: { data: { count: number } } };
			expect(body.result.data.count).toBe(1);
		});
	});
});

if (!hasPostgres) {
	describe('api', () => {
		it.skip(`skipped — ${skipReason()}`, () => {});
	});
}
