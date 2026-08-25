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

const EXPLICIT_PUBLIC_SEARCH_PATH = ['public'];

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
	searchPath: EXPLICIT_PUBLIC_SEARCH_PATH,
	...knexStringcase()
});


export interface DbOptions {
	transaction?: Knex;
}

export function setDb(next: Knex): void {
	db = next;
}

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
