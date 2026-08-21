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

export class EpsilonGreedyBandit implements Policy {
	private readonly random: () => number;
	private readonly trx: Knex;

	constructor(private readonly opts: BanditOptions = {}) {
		this.random = opts.random ?? Math.random;
		this.trx = opts.trx ?? db;
	}

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

	withTransaction(trx: Knex): EpsilonGreedyBandit {
		return new EpsilonGreedyBandit({ ...this.opts, trx });
	}

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
