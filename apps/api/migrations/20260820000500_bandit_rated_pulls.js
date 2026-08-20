/**
 * Separates "times this arm was pulled" from "times a reward actually arrived".
 *
 * The sample-mean update was dividing by `pulls`, which counts every query the
 * arm served — including the majority nobody rates. An arm pulled twenty times
 * and rated once moved its estimate by (R − Q)/20, so a single real observation
 * barely dented the optimistic prior, while an arm pulled once and rated once
 * adopted its reward outright.
 *
 * That asymmetry is self-reinforcing: the heavily-pulled, rarely-rated arm stays
 * pinned near the optimistic initialisation, keeps looking best, and keeps being
 * chosen. Counting rated samples separately makes N mean what the update rule
 * assumes it means, while `pulls` goes on driving epsilon decay and exploration
 * accounting, which is what it is genuinely the right number for.
 *
 * Backfill sets `rated_pulls` to 1 for arms that already carry a reward, which
 * is the smallest claim consistent with the data: a mean exists, so at least one
 * sample produced it, and the next rating replaces rather than dilutes it.
 */
export async function up(knex) {
	await knex.schema.withSchema('copilot').alterTable('bandit_arm', (table) => {
		table.integer('rated_pulls').notNullable().defaultTo(0);
	});

	await knex('copilot.bandit_arm').where('pulls', '>', 0).whereNot('mean_reward', 0).update({ rated_pulls: 1 });
}

export async function down(knex) {
	await knex.schema.withSchema('copilot').alterTable('bandit_arm', (table) => {
		table.dropColumn('rated_pulls');
	});
}
