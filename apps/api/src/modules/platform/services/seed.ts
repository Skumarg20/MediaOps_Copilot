import { createRequire } from 'node:module';
import { db, type DbOptions } from '@/connections/index.js';
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

const jobsFixture = require('../data/jobs.json') as JobFixture[];
const errorCodesFixture = require('../data/errorCodes.json') as ErrorCodeFixture;

export async function seedReferenceData({
	transaction
}: DbOptions = {}): Promise<{ jobs: number; errorCodes: number }> {
	if (!transaction) {
		return db.transaction((trx) => seedReferenceData({ transaction: trx }));
	}

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

	await transaction('platform.job').insert(jobs).onConflict('id').merge();
	await transaction('platform.errorCode').insert(errorCodes).onConflict('code').merge();

	const counts = { jobs: jobs.length, errorCodes: errorCodes.length };
	logEvent(logger, 'info', 'boot.seeded', counts);
	return counts;
}
