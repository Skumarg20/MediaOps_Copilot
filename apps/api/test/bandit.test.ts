import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '@/config.js';
import { setDb } from '@/connections/index.js';
import { EpsilonGreedyBandit, rlService } from '@/modules/rl/index.js';
import type { Action, TriageClass } from '@/types.js';
import { createTestDb, destroyTestDb, isPostgresAvailable, skipReason } from './helpers/db.js';

const { actionKey, allActions, computeReward, hallucinationPenaltyFor, maskActions } = rlService;

const VECTORLESS_LLAMA: Action = { path: 'vectorless', model: 'llama3.2:3b' };
const VECTOR_QWEN: Action = { path: 'vector', model: 'qwen2.5:3b' };


const PRIOR = config.rl.optimisticInit;

describe('reward function', () => {
	it('weights helpfulness an order of magnitude above latency', () => {
		const helpfulSlow = computeReward({ feedback: 1, latencyMs: 2000, hallucinationPenalty: 0 });
		const unhelpfulFast = computeReward({ feedback: 0, latencyMs: 10, hallucinationPenalty: 0 });

		expect(helpfulSlow).toBe(8);
		expect(unhelpfulFast).toBeCloseTo(-0.01, 4);
		expect(helpfulSlow).toBeGreaterThan(unhelpfulFast);
	});

	it('implements the reward formula the interface specifies', () => {
		expect(computeReward({ feedback: 1, latencyMs: 1500, hallucinationPenalty: 0 })).toBeCloseTo(8.5, 4);
		expect(computeReward({ feedback: 0, latencyMs: 1500, hallucinationPenalty: 0 })).toBeCloseTo(-1.5, 4);
		expect(computeReward({ feedback: 1, latencyMs: 1000, hallucinationPenalty: 5 })).toBeCloseTo(4, 4);
	});

	it('uses latency only as a tie-breaker between equally helpful answers', () => {
		const fast = computeReward({ feedback: 1, latencyMs: 900, hallucinationPenalty: 0 });
		const slow = computeReward({ feedback: 1, latencyMs: 1400, hallucinationPenalty: 0 });

		expect(fast).toBeGreaterThan(slow);
		expect(fast - slow).toBeCloseTo(0.5, 4);
	});

	it('produces legitimately negative rewards and does not clamp at zero', () => {
		const worst = computeReward({ feedback: 0, latencyMs: 3000, hallucinationPenalty: 5 });
		expect(worst).toBeCloseTo(-8, 4);
		expect(worst).toBeLessThan(0);
	});

	it('applies the hallucination penalty independently of the operator rating', () => {
		const rated = computeReward({ feedback: 1, latencyMs: 1000, hallucinationPenalty: 5 });
		const unrated = computeReward({ feedback: 0, latencyMs: 1000, hallucinationPenalty: 5 });

		expect(rated).toBeCloseTo(4, 4);
		expect(unrated).toBeCloseTo(-6, 4);
	});

	it('charges the penalty for an abstention and for a phantom citation alike', () => {
		expect(hallucinationPenaltyFor(false, 0)).toBe(5);
		expect(hallucinationPenaltyFor(true, 1)).toBe(5);
		expect(hallucinationPenaltyFor(true, 0)).toBe(0);
	});
});

describe('action masking', () => {
	it('reduces the space to the two arms sharing a pinned path', () => {
		const masked = maskActions({ pinnedPath: 'vectorless' });

		expect(masked).toHaveLength(2);
		expect(masked.every((action) => action.path === 'vectorless')).toBe(true);
		expect(masked.map((action) => action.model).sort()).toEqual(['llama3.2:3b', 'qwen2.5:3b']);
	});

	it('masks out an unavailable model without touching the path choice', () => {
		const masked = maskActions({ pinnedPath: null, availableModels: ['llama3.2:3b'] });

		expect(masked).toHaveLength(2);
		expect(masked.every((action) => action.model === 'llama3.2:3b')).toBe(true);
		expect(masked.map((action) => action.path).sort()).toEqual(['vector', 'vectorless']);
	});

	it('falls back to the full model set when nothing is reported healthy', () => {
		expect(maskActions({ pinnedPath: null, availableModels: [] })).toHaveLength(4);
	});

	it('round-trips an action through its canonical key', () => {
		expect(rlService.parseActionKey(actionKey(VECTOR_QWEN))).toEqual(VECTOR_QWEN);
	});
});

const hasPostgres = await isPostgresAvailable();

describe.skipIf(!hasPostgres)('epsilon-greedy bandit', () => {
	let db: Knex;

	beforeAll(async () => {
		db = await createTestDb('bandit');
		setDb(db);
	});

	afterAll(async () => {
		await destroyTestDb(db);
	});

	async function freshBandit(opts: { epsilon?: number; random?: () => number } = {}) {
		await db('copilot.banditArm').del();
		const bandit = new EpsilonGreedyBandit({
			...(opts.epsilon !== undefined ? { epsilonOverride: opts.epsilon } : {}),
			...(opts.random ? { random: opts.random } : {}),
			trx: db
		});
		await bandit.init();
		return bandit;
	}

	describe('incremental sample mean', () => {
		it('matches the arithmetic mean over a known rated sequence', async () => {
			const bandit = await freshBandit({ epsilon: 0 });
			const state: TriageClass = 'simple_lookup';
			const rewards = [8, -2, 6, 4];

			for (const reward of rewards) {
				await bandit.registerPull(state, VECTORLESS_LLAMA);
				await bandit.update(state, VECTORLESS_LLAMA, reward);
			}

			const arm = (await bandit.snapshot()).find(
				(candidate) => candidate.state === state && candidate.action === actionKey(VECTORLESS_LLAMA)
			);

			const expected = rewards.reduce((a, b) => a + b, 0) / rewards.length;
			expect(arm?.pulls).toBe(4);
			expect(arm?.meanReward).toBeCloseTo(expected, 4);
		});

		it('replaces the optimistic prior on the first real sample rather than averaging into it', async () => {
			const bandit = await freshBandit({ epsilon: 0 });
			const state: TriageClass = 'complex_diagnostic';

			const before = (await bandit.snapshot()).find(
				(arm) => arm.state === state && arm.action === actionKey(VECTOR_QWEN)
			);
			expect(before?.meanReward).toBe(PRIOR);

			await bandit.registerPull(state, VECTOR_QWEN);
			const after = await bandit.update(state, VECTOR_QWEN, -3);

			expect(after.meanReward).toBeCloseTo(-3, 4);
		});

		it('keeps unrated pulls out of the reward estimate while still counting them', async () => {
			const bandit = await freshBandit({ epsilon: 0 });
			const state: TriageClass = 'urgent_incident';

			await bandit.registerPull(state, VECTORLESS_LLAMA);
			const stats = (await bandit.snapshot()).find(
				(arm) => arm.state === state && arm.action === actionKey(VECTORLESS_LLAMA)
			);

			expect(stats?.pulls).toBe(1);
			expect(stats?.meanReward).toBe(PRIOR);
		});

		it('divides by rated samples, so unrated pulls cannot dilute a real observation', async () => {
			const bandit = await freshBandit({ epsilon: 0 });
			const state: TriageClass = 'simple_lookup';

			for (let i = 0; i < 20; i += 1) await bandit.registerPull(state, VECTOR_QWEN);

			const rated = await bandit.update(state, VECTOR_QWEN, 8);

			expect(rated.pulls).toBe(20);
			expect(rated.ratedPulls).toBe(1);
			expect(rated.meanReward).toBeCloseTo(8, 4);
		});

		it('averages across rated samples regardless of how many pulls went unrated', async () => {
			const bandit = await freshBandit({ epsilon: 0 });
			const state: TriageClass = 'complex_diagnostic';

			await bandit.registerPull(state, VECTORLESS_LLAMA);
			await bandit.update(state, VECTORLESS_LLAMA, 10);

			for (let i = 0; i < 5; i += 1) await bandit.registerPull(state, VECTORLESS_LLAMA);
			const second = await bandit.update(state, VECTORLESS_LLAMA, 0);

			expect(second.pulls).toBe(6);
			expect(second.ratedPulls).toBe(2);
			expect(second.meanReward).toBeCloseTo(5, 4);
		});
	});

	describe('selection', () => {
		it('always exploits when epsilon is 0', async () => {
			const bandit = await freshBandit({ epsilon: 0, random: () => 0 });
			const state: TriageClass = 'simple_lookup';

			await bandit.registerPull(state, VECTOR_QWEN);
			await bandit.update(state, VECTOR_QWEN, PRIOR + 4);

			for (let i = 0; i < 10; i += 1) {
				const decision = await bandit.select(state, allActions());
				expect(decision.exploring).toBe(false);
				expect(actionKey(decision.action)).toBe(actionKey(VECTOR_QWEN));
			}
		});

		it('always explores when epsilon is 1', async () => {
			const bandit = await freshBandit({ epsilon: 1, random: () => 0.999 });
			const decision = await bandit.select('simple_lookup', allActions());
			expect(decision.exploring).toBe(true);
		});

		it('never reports exploring when only one arm is allowed', async () => {
			const bandit = await freshBandit({ epsilon: 1, random: () => 0 });
			const decision = await bandit.select('simple_lookup', [VECTORLESS_LLAMA]);

			expect(decision.exploring).toBe(false);
			expect(actionKey(decision.action)).toBe(actionKey(VECTORLESS_LLAMA));
		});

		it('tries every arm once before repeating any, via optimistic initialisation', async () => {
			const bandit = await freshBandit({ epsilon: 0, random: () => 0 });
			const state: TriageClass = 'complex_diagnostic';
			const actions = allActions();
			const chosen: string[] = [];

			for (let i = 0; i < actions.length; i += 1) {
				const decision = await bandit.select(state, actions);
				chosen.push(actionKey(decision.action));
				await bandit.registerPull(state, decision.action);
			}

			expect(new Set(chosen).size).toBe(actions.length);
		});

		it('cannot explore onto a pinned-away path even at epsilon 1', async () => {
			const bandit = await freshBandit({ epsilon: 1, random: () => 0.5 });
			const allowed = maskActions({ pinnedPath: 'vectorless' });

			for (let i = 0; i < 15; i += 1) {
				const decision = await bandit.select('complex_diagnostic', allowed);
				expect(decision.action.path).toBe('vectorless');
			}
		});

		it('decays epsilon from the start value toward the floor as pulls accumulate', async () => {
			const bandit = await freshBandit();
			const state: TriageClass = 'simple_lookup';

			expect(await bandit.epsilonFor(state)).toBeCloseTo(0.2, 4);

			for (let i = 0; i < 40; i += 1) await bandit.registerPull(state, VECTORLESS_LLAMA);

			expect(await bandit.epsilonFor(state)).toBeCloseTo(0.05, 4);
		});

		it('throws rather than guessing when the action space is empty', async () => {
			const bandit = await freshBandit();
			await expect(bandit.select('simple_lookup', [])).rejects.toThrow(/empty action space/);
		});
	});

	describe('state separation and durability', () => {
		it('learns an independent reward estimate per triage class', async () => {
			const bandit = await freshBandit({ epsilon: 0 });
			const states: TriageClass[] = ['simple_lookup', 'complex_diagnostic', 'urgent_incident'];
			const rewards = [9, -4, 2];

			for (const [index, state] of states.entries()) {
				await bandit.registerPull(state, VECTORLESS_LLAMA);
				await bandit.update(state, VECTORLESS_LLAMA, rewards[index]!);
			}

			const snapshot = await bandit.snapshot();
			for (const [index, state] of states.entries()) {
				const arm = snapshot.find(
					(candidate) => candidate.state === state && candidate.action === actionKey(VECTORLESS_LLAMA)
				);
				expect(arm?.meanReward).toBeCloseTo(rewards[index]!, 4);
			}
		});

		it('persists arm statistics across policy instances sharing a store', async () => {
			const first = await freshBandit({ epsilon: 0 });
			await first.registerPull('simple_lookup', VECTOR_QWEN);
			await first.update('simple_lookup', VECTOR_QWEN, 7.5);

			const second = new EpsilonGreedyBandit({ epsilonOverride: 0, trx: db });
			await second.init();

			const arm = (await second.snapshot()).find(
				(candidate) => candidate.state === 'simple_lookup' && candidate.action === actionKey(VECTOR_QWEN)
			);

			expect(arm?.meanReward).toBeCloseTo(7.5, 4);
			expect(arm?.pulls).toBe(1);
		});

		it('initialises the full 3-state × 4-arm table', async () => {
			const bandit = await freshBandit();
			expect(await bandit.snapshot()).toHaveLength(12);
		});
	});
});

if (!hasPostgres) {
	describe('epsilon-greedy bandit', () => {
		it.skip(`skipped — ${skipReason()}`, () => {});
	});
}
