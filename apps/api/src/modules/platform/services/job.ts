import type { Knex } from 'knex';
import { db } from '@/connections/index.js';

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

export async function getJob({ id }: { id: string }, trx: Knex = db): Promise<Job | undefined> {
	return trx('platform.job').where({ id }).first();
}

export async function listJobs(_args: Record<string, never> = {}, trx: Knex = db): Promise<Job[]> {
	return trx('platform.job').select('*').orderBy('id', 'asc');
}

export async function getJobIds(_args: Record<string, never> = {}, trx: Knex = db): Promise<Set<string>> {
	const rows = await trx('platform.job').select('id');
	return new Set(rows.map((row: { id: string }) => row.id));
}

export async function countIncidentMatches({ query }: { query: string }, trx: Knex = db): Promise<number> {
	const upper = query.toUpperCase();
	const rows = await trx('platform.job').whereNotNull('failureReason').select('failureReason');
	return rows.filter((row: { failureReason: string }) => upper.includes(row.failureReason)).length;
}
