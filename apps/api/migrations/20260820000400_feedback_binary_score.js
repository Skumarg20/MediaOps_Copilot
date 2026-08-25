export async function up(knex) {
	await knex.raw('alter table copilot.feedback drop constraint if exists feedback_score_check');
	await knex.raw('alter table copilot.feedback add constraint feedback_score_check check (score in (0, 1))');

	await knex('copilot.feedback').where({ score: -1 }).update({ score: 0 });
}

export async function down(knex) {
	await knex.raw('alter table copilot.feedback drop constraint if exists feedback_score_check');
	await knex.raw('alter table copilot.feedback add constraint feedback_score_check check (score in (-1, 1))');
}
