import { createRequire } from 'node:module';
import type { Knex } from 'knex';
import { db } from '@/connections/index.js';
import { logEvent, logger } from '@/utils/index.js';

const require = createRequire(import.meta.url);

type JobFixture = {
	id: string;
	status: string;
	failure_reason: string | null;
	worker: string | null;
	duration_s: number;
	queued_at: string;
	job_class: string;
	priority: string;
	submitter: string;
};

type ErrorCodeFixture = Record<string, { meaning: string; severity: string; remediation: string }>;

/**
 * Required rather than read from disk so tsc bundles the fixtures into dist/ and
 * they resolve identically inside the container.
 */
const jobsFixture = require('../data/jobs.json') as JobFixture[];
const errorCodesFixture = require('../data/errorCodes.json') as ErrorCodeFixture;

/**
 * Reference data is idempotently re-seeded on every boot: it is derived from the
 * repo, so the repo wins. Learned state in the `copilot` schema is never touched
 * here — that is the system's memory.
 */
export async function seedReferenceData(
	_args: Record<string, never> = {},
	trx: Knex = db
): Promise<{ jobs: number; errorCodes: number }> {
	const jobs = jobsFixture.map((job) => ({
		id: job.id,
		status: job.status,
		failureReason: job.failure_reason,
		worker: job.worker,
		durationS: job.duration_s,
		queuedAt: new Date(job.queued_at),
		jobClass: job.job_class,
		priority: job.priority,
		submitter: job.submitter
	}));

	const errorCodes = Object.entries(errorCodesFixture).map(([code, body]) => ({ code, ...body }));

	await trx.transaction(async (tx) => {
		await tx('platform.job').insert(jobs).onConflict('id').merge();
		await tx('platform.errorCode').insert(errorCodes).onConflict('code').merge();
	});

	const counts = { jobs: jobs.length, errorCodes: errorCodes.length };
	logEvent(logger, 'info', 'boot.seeded', counts);
	return counts;
}
