import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex, { type Knex } from 'knex';
import knexStringcaseModule from 'knex-stringcase';

type StringcaseFactory = (opts?: Record<string, unknown>) => Record<string, unknown>;
const knexStringcase = ((knexStringcaseModule as unknown as { default?: StringcaseFactory }).default ??
	(knexStringcaseModule as unknown as StringcaseFactory)) as StringcaseFactory;

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../../migrations');

export const TEST_DB_CONFIG = {
	client: process.env.DB_CLIENT ?? 'pg',
	host: process.env.DB_HOST ?? 'localhost',
	port: Number(process.env.DB_PORT ?? 5432),
	user: process.env.DB_USER ?? 'copilot',
	password: process.env.DB_PASSWORD ?? 'copilot',
	database: process.env.TEST_DB_DATABASE ?? process.env.DB_DATABASE ?? 'mediaops_test'
};

let cached: { available: boolean } | null = null;

export async function isPostgresAvailable(): Promise<boolean> {
	if (cached) return cached.available;

	const probe = knex({
		client: TEST_DB_CONFIG.client,
		connection: {
			host: TEST_DB_CONFIG.host,
			port: TEST_DB_CONFIG.port,
			user: TEST_DB_CONFIG.user,
			password: TEST_DB_CONFIG.password,
			database: TEST_DB_CONFIG.database
		},
		pool: { min: 0, max: 1, acquireTimeoutMillis: 3000 }
	});

	try {
		await probe.raw('select 1');
		cached = { available: true };
	} catch {
		cached = { available: false };
	} finally {
		await probe.destroy();
	}

	if (!cached.available && process.env.REQUIRE_POSTGRES === 'true') {
		throw new Error(`REQUIRE_POSTGRES is set but ${skipReason()}`);
	}

	return cached.available;
}

export function skipReason(): string {
	return (
		`Postgres is not reachable at ${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}/${TEST_DB_CONFIG.database}. ` +
		'Start it with `docker compose up -d postgres` and create the test database ' +
		'(`createdb mediaops_test`), or set TEST_DB_DATABASE.'
	);
}

const TABLES = [
	'copilot.tool_invocation',
	'copilot.citation',
	'copilot.feedback',
	'copilot.transaction',
	'copilot.bandit_arm',
	'platform.job',
	'platform.error_code'
];

export async function createTestDb(_namespace: string): Promise<Knex> {
	const connection = knex({
		client: TEST_DB_CONFIG.client,
		connection: {
			host: TEST_DB_CONFIG.host,
			port: TEST_DB_CONFIG.port,
			user: TEST_DB_CONFIG.user,
			password: TEST_DB_CONFIG.password,
			database: TEST_DB_CONFIG.database
		},
		pool: { min: 1, max: 2 },
		searchPath: ['public'],
		migrations: {
			directory: MIGRATIONS_DIR,
			extension: 'js',
			loadExtensions: ['.js'],
			schemaName: 'public',
			tableName: 'knex_migrations'
		},
		...knexStringcase()
	});

	await connection.raw('drop schema if exists copilot cascade');
	await connection.raw('drop schema if exists platform cascade');
	await connection.raw('drop table if exists knex_migrations, knex_migrations_lock');

	await connection.migrate.latest();

	return connection;
}

export async function truncateAll(connection: Knex): Promise<void> {
	await connection.raw(`truncate table ${TABLES.join(', ')} restart identity cascade`);
}

export async function destroyTestDb(connection: Knex): Promise<void> {
	await connection.destroy();
}
