import type { Knex } from 'knex';
import { config } from '@/config.js';
import { db } from '@/connections/index.js';
import { logEvent, logger, rlPulls, rlReward } from '@/utils/index.js';
import type { Action, ArmStats, Decision, Policy, TriageClass } from '@/types.js';
import { TRIAGE_CLASSES, actionKey, allActions } from './state.js';

export interface BanditOptions {
	epsilonOverride?: number;
	random?: () => number;
	trx?: Knex;
}

interface ArmRow {
	state: string;
	action: string;
	pulls: number;
	ratedPulls: number;
	meanReward: number;
	lastUpdated: Date;
}

function toStats(row: ArmRow): ArmStats {
	return {
		state: row.state as TriageClass,
		action: row.action,
		pulls: row.pulls,
		ratedPulls: row.ratedPulls,
		meanReward: row.meanReward,
		lastUpdated: row.lastUpdated instanceof Date ? row.lastUpdated.toISOString() : String(row.lastUpdated)
	};
}

/**
 * Epsilon-greedy contextual bandit.
 *
 *   state  = triage class (3)
 *   action = (retrieval_path, model) (4, masked to 2 when a path is pinned)
 *   update = incremental sample mean, Q <- Q + (R - Q)/N
 *
 * Arm statistics are written through to Postgres on every update, so learning
 * survives a restart — which is what makes "it improved over the session" an
 * observable property rather than a claim.
 */
export class EpsilonGreedyBandit implements Policy {
	private readonly random: () => number;
	private readonly trx: Knex;

	constructor(private readonly opts: BanditOptions = {}) {
		this.random = opts.random ?? Math.random;
		this.trx = opts.trx ?? db;
	}

	/**
	 * Optimistic initialisation (Q0 = 5.0) guarantees every arm is tried before
	 * any is abandoned, without a separate warm-up mode: an untried arm looks
	 * better than a merely-average one until it proves otherwise.
	 */
	async init(): Promise<void> {
		const rows = TRIAGE_CLASSES.flatMap((state) =>
			allActions().map((action) => ({
				state,
				action: actionKey(action),
				pulls: 0,
				ratedPulls: 0,
				meanReward: config.rl.optimisticInit,
				lastUpdated: new Date()
			}))
		);

		await this.trx('copilot.banditArm').insert(rows).onConflict(['state', 'action']).ignore();

		for (const arm of await this.snapshot()) {
			rlReward.set({ state: arm.state, action: arm.action }, arm.meanReward);
		}
	}

	/**
	 * The same policy, reading and writing through `trx`.
	 *
	 * Arm statistics live in Postgres precisely so learning survives a restart;
	 * that only holds if a rating and the update it causes land together. This is
	 * what lets the caller put both inside one transaction.
	 */
	withTransaction(trx: Knex): EpsilonGreedyBandit {
		return new EpsilonGreedyBandit({ ...this.opts, trx });
	}

	/**
	 * `lock` takes a row lock for the read-modify-write in `update()`. Two ratings
	 * for the same arm arriving together would otherwise both read the old mean
	 * and the second write would silently discard the first.
	 */
	private async row(state: TriageClass, key: string, lock = false): Promise<ArmStats> {
		const query = this.trx('copilot.banditArm').where({ state, action: key });
		const found = (await (lock ? query.forUpdate() : query).first()) as ArmRow | undefined;
		if (found) return toStats(found);

		const seed = {
			state,
			action: key,
			pulls: 0,
			ratedPulls: 0,
			meanReward: config.rl.optimisticInit,
			lastUpdated: new Date()
		};
		await this.trx('copilot.banditArm').insert(seed).onConflict(['state', 'action']).ignore();
		return toStats(seed as ArmRow);
	}

	private async statePulls(state: TriageClass): Promise<number> {
		const row = (await this.trx('copilot.banditArm').where({ state }).sum({ total: 'pulls' }).first()) as
			{ total: string | number | null } | undefined;
		return Number(row?.total ?? 0);
	}

	async epsilonFor(state: TriageClass): Promise<number> {
		if (this.opts.epsilonOverride !== undefined) return this.opts.epsilonOverride;

		const { epsilonStart, epsilonFloor, epsilonDecayPulls } = config.rl;
		const pulls = await this.statePulls(state);
		if (pulls >= epsilonDecayPulls) return epsilonFloor;

		const progress = epsilonDecayPulls === 0 ? 1 : pulls / epsilonDecayPulls;
		return epsilonStart - (epsilonStart - epsilonFloor) * progress;
	}

	async select(state: TriageClass, allowed: Action[]): Promise<Decision> {
		if (allowed.length === 0) {
			throw new Error('bandit.select called with an empty action space');
		}

		const epsilon = await this.epsilonFor(state);
		const stats = await Promise.all(
			allowed.map(async (action) => ({ action, stats: await this.row(state, actionKey(action)) }))
		);

		const draw = this.random();
		const exploring = allowed.length > 1 && draw < epsilon;

		let chosen: { action: Action; stats: ArmStats };
		if (exploring) {
			const index = Math.min(allowed.length - 1, Math.floor(this.random() * allowed.length));
			chosen = stats[index] ?? stats[0]!;
		} else {
			chosen = stats.reduce((best, cur) => {
				if (cur.stats.meanReward > best.stats.meanReward) return cur;
				if (cur.stats.meanReward === best.stats.meanReward && cur.stats.pulls < best.stats.pulls) return cur;
				return best;
			}, stats[0]!);
		}

		return {
			action: chosen.action,
			exploring,
			epsilon: Number(epsilon.toFixed(4)),
			armStats: chosen.stats,
			consideredArms: allowed.map(actionKey)
		};
	}

	/**
	 * Provisional phase: the arm was pulled, the reward has not arrived. The pull
	 * count moves so exploration accounting stays honest; Q does not, so silence
	 * is read as neither approval nor disapproval.
	 */
	async registerPull(state: TriageClass, action: Action): Promise<ArmStats> {
		const key = actionKey(action);
		await this.row(state, key);

		const [updated] = (await this.trx('copilot.banditArm')
			.where({ state, action: key })
			.update({ pulls: this.trx.raw('?? + 1', ['pulls']), lastUpdated: new Date() })
			.returning('*')) as ArmRow[];

		const stats = toStats(updated!);
		logEvent(logger, 'info', 'rl.pull', {
			state,
			action: key,
			pulls: stats.pulls,
			mean: stats.meanReward
		});
		return stats;
	}

	/**
	 * Terminal phase: fold the realised reward into the running mean.
	 * Q(s,a) <- Q(s,a) + (1/N)*(R - Q(s,a))
	 *
	 * N counts *rated* pulls, not pulls. Dividing by every pull the arm served
	 * would let the unrated majority dilute each real observation — an arm pulled
	 * twenty times and rated once would move by (R − Q)/20 and stay pinned near
	 * the optimistic prior, which keeps it looking best and keeps it being chosen.
	 * `pulls` still drives epsilon decay and exploration accounting, where every
	 * pull genuinely counts.
	 *
	 * The first rated sample replaces the prior outright rather than averaging
	 * against a number nobody observed.
	 */
	async update(state: TriageClass, action: Action, reward: number): Promise<ArmStats> {
		const key = actionKey(action);
		const current = await this.row(state, key, true);

		const ratedSamples = current.ratedPulls + 1;
		const mean = ratedSamples <= 1 ? reward : current.meanReward + (reward - current.meanReward) / ratedSamples;

		const [updated] = (await this.trx('copilot.banditArm')
			.where({ state, action: key })
			.update({
				meanReward: Number(mean.toFixed(6)),
				ratedPulls: this.trx.raw('?? + 1', ['ratedPulls']),
				lastUpdated: new Date()
			})
			.returning('*')) as ArmRow[];

		const stats = toStats(updated!);
		rlReward.set({ state, action: key }, stats.meanReward);
		logEvent(logger, 'info', 'rl.updated', {
			state,
			action: key,
			reward,
			new_mean: stats.meanReward,
			pulls: stats.pulls,
			rated_pulls: stats.ratedPulls
		});
		return stats;
	}

	async snapshot(): Promise<ArmStats[]> {
		const rows = (await this.trx('copilot.banditArm')
			.select('*')
			.orderBy([{ column: 'state' }, { column: 'action' }])) as ArmRow[];
		return rows.map(toStats);
	}
}

export function recordPullMetric(state: TriageClass, action: string, exploring: boolean): void {
	rlPulls.inc({ state, action, exploring: String(exploring) });
}
