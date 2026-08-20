import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex, { type Knex } from 'knex';
import knexStringcaseModule from 'knex-stringcase';

type StringcaseFactory = (opts?: Record<string, unknown>) => Record<string, unknown>;
const knexStringcase = ((knexStringcaseModule as unknown as { default?: StringcaseFactory }).default ??
	(knexStringcaseModule as unknown as StringcaseFactory)) as StringcaseFactory;

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../../migrations');

/**
 * Integration suites run against a real Postgres, not a stand-in.
 *
 * The bandit's correctness depends on `on conflict`, `returning`, and atomic
 * increments; the store depends on jsonb round-tripping. A fake would agree with
 * whatever the code does and prove none of it. The cost is that these suites
 * need a database — which is why they skip with a clear message instead of
 * failing when one is not configured.
 */
export const TEST_DB_CONFIG = {
	client: process.env.DB_CLIENT ?? 'pg',
	host: process.env.DB_HOST ?? 'localhost',
	port: Number(process.env.DB_PORT ?? 5432),
	user: process.env.DB_USER ?? 'copilot',
	password: process.env.DB_PASSWORD ?? 'copilot',
	database: process.env.TEST_DB_DATABASE ?? process.env.DB_DATABASE ?? 'mediaops_test'
};

let cached: { available: boolean } | null = null;

/** Probed once per process, so a missing database costs one connect attempt. */
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

/**
 * Applies the real migrations, then truncates every table.
 *
 * An earlier version of this helper created suffixed scratch schemas and aliased
 * them with `search_path`. That silently could not work: the application
 * addresses tables as `copilot.transaction`, and a schema-qualified name ignores
 * `search_path` entirely. Suites are serial (`fileParallelism: false`), so
 * truncating shared schemas gives the same isolation without the illusion.
 *
 * Running `migrate.latest` rather than re-declaring the DDL here means the
 * suites exercise the migrations themselves — the helper cannot drift from what
 * production actually creates.
 */
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
		// Mirrors knexfile.js: the `copilot` schema shares its name with the DB
		// user, so an unpinned search path sends unqualified references there.
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

	// Rebuild from nothing rather than migrating onto whatever a previous run
	// left behind. A test database that has drifted — tables present but
	// unrecorded in `knex_migrations`, say, after an interrupted run — makes
	// `migrate.latest()` fail on "already exists", and the failure surfaces as a
	// skipped suite rather than a clear error. Dropping first removes the whole
	// class of problem, and costs a second.
	await connection.raw('drop schema if exists copilot cascade');
	await connection.raw('drop schema if exists platform cascade');
	await connection.raw('drop table if exists knex_migrations, knex_migrations_lock');

	await connection.migrate.latest();

	return connection;
}

/** Wipes both schemas so a suite never inherits another's rows. */
export async function truncateAll(connection: Knex): Promise<void> {
	// One statement, so foreign keys never observe a half-empty state.
	await connection.raw(`truncate table ${TABLES.join(', ')} restart identity cascade`);
}

export async function destroyTestDb(connection: Knex): Promise<void> {
	await connection.destroy();
}
