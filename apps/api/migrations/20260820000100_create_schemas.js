export async function up(knex) {
	await knex.raw('create schema if not exists platform');
	await knex.raw('create schema if not exists copilot');
}

export async function down(knex) {
	await knex.raw('drop schema if exists copilot cascade');
	await knex.raw('drop schema if exists platform cascade');
}
