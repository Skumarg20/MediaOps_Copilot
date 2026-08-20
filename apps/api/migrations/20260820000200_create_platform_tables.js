
/**
 * Reference data: the render platform's own records, mocked. Rebuildable from
 * the repo's fixtures, so an operator can truncate and re-seed these safely.
 */
export async function up(knex) {
	await knex.schema.withSchema('platform').createTable('job', (table) => {
		table.text('id').primary();
		table.text('status').notNullable();
		table.text('failure_reason');
		table.text('worker');
		table.integer('duration_s').notNullable().defaultTo(0);
		table.timestamp('queued_at', { useTz: true }).notNullable();
		table.text('job_class').notNullable();
		table.text('priority').notNullable();
		table.text('submitter').notNullable();

		table.index('failure_reason', 'job_failure_reason_idx');
		table.index('worker', 'job_worker_idx');
	});

	await knex.schema.withSchema('platform').createTable('error_code', (table) => {
		table.text('code').primary();
		table.text('meaning').notNullable();
		table.text('severity').notNullable();
		table.text('remediation').notNullable();
	});
}

export async function down(knex) {
	await knex.schema.withSchema('platform').dropTableIfExists('error_code');
	await knex.schema.withSchema('platform').dropTableIfExists('job');
}
