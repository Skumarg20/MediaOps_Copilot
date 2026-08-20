
/**
 * Learned state — the system's memory. Never rebuilt from the repo: if these
 * tables are lost, every rating an operator ever gave is lost with them.
 */
export async function up(knex) {
	await knex.schema.withSchema('copilot').createTable('transaction', (table) => {
		table.uuid('id').primary();
		table.text('query').notNullable();
		table.text('answer').notNullable();
		table.text('path').notNullable();
		table.text('model').notNullable();
		table.text('triage_class').notNullable();
		table.integer('latency_ms').notNullable();
		table.boolean('grounded').notNullable();
		table.specificType('overlap_score', 'real').notNullable();
		table.text('confidence_band').notNullable();
		table.specificType('hallucination_penalty', 'real').notNullable();
		table.boolean('exploring').notNullable();
		table.boolean('degraded').notNullable().defaultTo(false);
		table.jsonb('rationale').notNullable();
		table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
		table.index(['created_at'], 'transaction_created_at_idx');
	});

	await knex.schema.withSchema('copilot').createTable('feedback', (table) => {
		table
			.uuid('transaction_id')
			.primary()
			.references('id')
			.inTable('copilot.transaction')
			.onDelete('CASCADE');
		table.integer('score').notNullable();
		table.specificType('reward', 'real').notNullable();
		table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

		table.check('?? in (-1, 1)', ['score'], 'feedback_score_check');
		table.index(['created_at'], 'feedback_created_at_idx');
	});

	await knex.schema.withSchema('copilot').createTable('bandit_arm', (table) => {
		table.text('state').notNullable();
		table.text('action').notNullable();
		table.integer('pulls').notNullable().defaultTo(0);
		table.specificType('mean_reward', 'real').notNullable().defaultTo(0);
		table.timestamp('last_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());

		table.primary(['state', 'action']);
	});

	await knex.schema.withSchema('copilot').createTable('citation', (table) => {
		table
			.uuid('transaction_id')
			.notNullable()
			.references('id')
			.inTable('copilot.transaction')
			.onDelete('CASCADE');
		table.text('evidence_id').notNullable();
		table.text('source').notNullable();
		table.specificType('score', 'real');
		table.text('excerpt').notNullable();

		table.primary(['transaction_id', 'evidence_id']);
	});

	await knex.schema.withSchema('copilot').createTable('tool_invocation', (table) => {
		table.bigIncrements('id').primary();
		table.uuid('transaction_id').notNullable();
		table.text('tool').notNullable();
		table.jsonb('args').notNullable();
		table.boolean('simulated').notNullable();
		table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
		table.index(['transaction_id'], 'tool_invocation_transaction_idx');
	});
}

export async function down(knex) {
	await knex.schema.withSchema('copilot').dropTableIfExists('tool_invocation');
	await knex.schema.withSchema('copilot').dropTableIfExists('citation');
	await knex.schema.withSchema('copilot').dropTableIfExists('bandit_arm');
	await knex.schema.withSchema('copilot').dropTableIfExists('feedback');
	await knex.schema.withSchema('copilot').dropTableIfExists('transaction');
}
