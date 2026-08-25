import { db, type DbOptions } from '@/connections/index.js';

export interface ErrorCode {
	code: string;
	meaning: string;
	severity: string;
	remediation: string;
}

export async function getErrorCode(
	{ code }: { code: string },
	{ transaction = db }: DbOptions = {}
): Promise<ErrorCode | undefined> {
	return transaction('platform.errorCode').where({ code: code.toUpperCase() }).first();
}

export async function listErrorCodes({ transaction = db }: DbOptions = {}): Promise<ErrorCode[]> {
	return transaction('platform.errorCode').select('*').orderBy('code', 'asc');
}

export async function getErrorCodeKeys({ transaction = db }: DbOptions = {}): Promise<Set<string>> {
	const rows = await transaction('platform.errorCode').select('code');
	return new Set(rows.map((row: { code: string }) => row.code));
}
