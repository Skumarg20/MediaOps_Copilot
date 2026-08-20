import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: [
			// Mirrors the tsconfig `@/*` path mapping. The `.js` specifiers the
			// source uses are TypeScript's NodeNext convention; strip them so Vite
			// resolves the `.ts` file on disk.
			{ find: /^@\/(.*)\.js$/, replacement: path.resolve(__dirname, 'src/$1.ts') },
			{ find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src/$1') }
		]
	},
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
		globals: false,
		// Suites share one Postgres database (each takes its own schema pair), and
		// the module-level connection singleton is process-wide. Serial files keep
		// both deterministic.
		fileParallelism: false,
		testTimeout: 30_000,
		// The service logs one JSON line per decision; at test volume that buries
		// the assertion output.
		env: {
			LOG_LEVEL: 'silent',
			NODE_ENV: 'test',
			VITEST: 'true'
		}
	}
});
