import type { Knex } from 'knex';
import { db } from '@/connections/index.js';

export interface ErrorCode {
	code: string;
	meaning: string;
	severity: string;
	remediation: string;
}

export async function getErrorCode({ code }: { code: string }, trx: Knex = db): Promise<ErrorCode | undefined> {
	return trx('platform.errorCode').where({ code: code.toUpperCase() }).first();
}

export async function listErrorCodes(_args: Record<string, never> = {}, trx: Knex = db): Promise<ErrorCode[]> {
	return trx('platform.errorCode').select('*').orderBy('code', 'asc');
}

export async function getErrorCodeKeys(_args: Record<string, never> = {}, trx: Knex = db): Promise<Set<string>> {
	const rows = await trx('platform.errorCode').select('code');
	return new Set(rows.map((row: { code: string }) => row.code));
}
