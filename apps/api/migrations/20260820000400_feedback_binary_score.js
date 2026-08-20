/**
 * Widens the feedback score constraint from `(-1, 1)` to `(0, 1)`.
 *
 * The interface contract is a binary score where `1 = helpful` and
 * `0 = unhelpful`, and the reward formula consumes that value directly:
 * `Reward = (score × 10) − latency_s − hallucination_penalty`. The original
 * constraint encoded an earlier ±1 convention and would have rejected every
 * "unhelpful" rating a spec-conformant client sent.
 *
 * This is a new migration rather than an edit to the one that created the table:
 * that migration has already been applied to real databases, and rewriting
 * applied history would leave them silently on the old constraint.
 */
export async function up(knex) {
	await knex.raw('alter table copilot.feedback drop constraint if exists feedback_score_check');
	await knex.raw('alter table copilot.feedback add constraint feedback_score_check check (score in (0, 1))');

	// Any rating stored under the old convention means the same thing as 0.
	await knex('copilot.feedback').where({ score: -1 }).update({ score: 0 });
}

export async function down(knex) {
	await knex.raw('alter table copilot.feedback drop constraint if exists feedback_score_check');
	await knex.raw('alter table copilot.feedback add constraint feedback_score_check check (score in (-1, 1))');
}
