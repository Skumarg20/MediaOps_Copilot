import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@\/(.*)\.js$/, replacement: path.resolve(__dirname, 'src/$1.ts') },
			{ find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src/$1') }
		]
	},
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
		globals: false,
		fileParallelism: false,
		testTimeout: 30_000,
		env: {
			LOG_LEVEL: 'silent',
			NODE_ENV: 'test',
			VITEST: 'true'
		}
	}
});
