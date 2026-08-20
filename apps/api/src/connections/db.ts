import knex, { type Knex } from 'knex';
import knexStringcaseModule from 'knex-stringcase';

type StringcaseFactory = (opts?: Record<string, unknown>) => Record<string, unknown>;


const knexStringcase = ((knexStringcaseModule as unknown as { default?: StringcaseFactory }).default ??
	(knexStringcaseModule as unknown as StringcaseFactory)) as StringcaseFactory;

const {
	PROJECT_ENV,
	DB_CLIENT = 'pg',
	DB_HOST = 'localhost',
	DB_PORT = '5432',
	DB_USER = 'copilot',
	DB_DATABASE = 'mediaops',
	DB_PASSWORD = 'copilot',
	DB_SSL
} = process.env;

const MAX_POOL_SIZE = PROJECT_ENV === 'production' ? 50 : 2;

export let db: Knex = knex({
	client: DB_CLIENT,
	connection: {
		host: DB_HOST,
		port: Number(DB_PORT),
		user: DB_USER,
		database: DB_DATABASE,
		password: DB_PASSWORD,
		...(DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
	},
	pool: { min: 1, max: MAX_POOL_SIZE },
	// Every query in this codebase is schema-qualified, so this is belt-and-
	// braces — but the default `"$user", public` resolves `$user` to the
	// `copilot` schema whenever the DB user shares its name, and an unqualified
	// reference added later would land somewhere surprising. Pin it.
	searchPath: ['public'],
	...knexStringcase()
});


/**
 * Test seam. Service functions default their `trx` parameter to `db`, and that
 * default is evaluated per call, so swapping the binding here redirects every
 * query without threading a connection through call signatures that would carry
 * it for no other reason.
 */
export function setDb(next: Knex): void {
	db = next;
}

/**
 * The `select 1` probe behind /health. A failure here is fatal, not degraded:
 * nothing can be recorded or learned, so serving would be dishonest.
 */
export async function pingDb(connection: Knex = db): Promise<boolean> {
	try {
		await connection.raw('select 1');
		return true;
	} catch {
		return false;
	}
}

export async function closeDb(connection: Knex = db): Promise<void> {
	await connection.destroy();
}
