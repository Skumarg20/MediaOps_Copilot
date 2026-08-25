import { db, type DbOptions } from '@/connections/index.js';

export interface Job {
	id: string;
	status: string;
	failureReason: string | null;
	worker: string | null;
	durationS: number;
	queuedAt: Date;
	jobClass: string;
	priority: string;
	submitter: string;
}

export async function getJob({ id }: { id: string }, { transaction = db }: DbOptions = {}): Promise<Job | undefined> {
	return transaction('platform.job').where({ id }).first();
}

export async function listJobs({ transaction = db }: DbOptions = {}): Promise<Job[]> {
	return transaction('platform.job').select('*').orderBy('id', 'asc');
}

export async function getJobIds({ transaction = db }: DbOptions = {}): Promise<Set<string>> {
	const rows = await transaction('platform.job').select('id');
	return new Set(rows.map((row: { id: string }) => row.id));
}

export async function countIncidentMatches(
	{ query }: { query: string },
	{ transaction = db }: DbOptions = {}
): Promise<number> {
	const upper = query.toUpperCase();
	const rows = await transaction('platform.job').whereNotNull('failureReason').select('failureReason');
	return rows.filter((row: { failureReason: string }) => upper.includes(row.failureReason)).length;
}
