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
