/**
 * Migrations live in-repo because this project has to be runnable from a clean
 * clone. (The dino platform keeps schema management outside the service; that
 * works when a DBA owns the cluster, not when `docker compose up` is the whole
 * setup story.)
 */
import knexStringcase from 'knex-stringcase';

const {
	DB_CLIENT = 'pg',
	DB_HOST = 'localhost',
	DB_PORT = '5432',
	DB_USER = 'copilot',
	DB_DATABASE = 'mediaops',
	DB_PASSWORD = 'copilot',
	DB_SSL
} = process.env;

const config = {
	client: DB_CLIENT,
	connection: {
		host: DB_HOST,
		port: Number(DB_PORT),
		user: DB_USER,
		database: DB_DATABASE,
		password: DB_PASSWORD,
		...(DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
	},
	pool: { min: 1, max: 2 },
	// Postgres defaults `search_path` to `"$user", public`. The database user is
	// `copilot` and migration 1 creates a schema also called `copilot`, so from
	// that moment every UNQUALIFIED table reference silently resolves into the
	// copilot schema instead of public — which produced two rival
	// `knex_migrations` tables and made every migration re-run as "already
	// exists". Pinning the search path and the migration table's schema removes
	// the ambiguity rather than relying on a name never colliding.
	searchPath: ['public'],
	migrations: {
		directory: './migrations',
		extension: 'js',
		loadExtensions: ['.js'],
		schemaName: 'public',
		tableName: 'knex_migrations'
	},
	...knexStringcase()
};

export default config;
