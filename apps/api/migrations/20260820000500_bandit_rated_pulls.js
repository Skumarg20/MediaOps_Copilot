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
