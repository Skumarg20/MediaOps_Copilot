
/**
 * Postgres schemas, one per bounded context — the same `schema.table` addressing
 * the platform uses (`device.bundle`, `payment.payment`, ...).
 *
 * The split matters beyond tidiness: `platform` holds reference data re-seeded
 * from the repo on every boot, while `copilot` holds learned state that must
 * never be rebuilt. Separate schemas make "what is safe to truncate" a property
 * of the namespace rather than of a comment someone has to read.
 */
export async function up(knex) {
	await knex.raw('create schema if not exists platform');
	await knex.raw('create schema if not exists copilot');
}

export async function down(knex) {
	await knex.raw('drop schema if exists copilot cascade');
	await knex.raw('drop schema if exists platform cascade');
}
