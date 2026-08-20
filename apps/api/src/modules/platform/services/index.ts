import { getErrorCode, getErrorCodeKeys, listErrorCodes } from './errorCode.js';
import { countIncidentMatches, getJob, getJobIds, listJobs } from './job.js';
import { seedReferenceData } from './seed.js';

export const platformService = {
	getJob,
	listJobs,
	getJobIds,
	countIncidentMatches,
	getErrorCode,
	listErrorCodes,
	getErrorCodeKeys,
	seedReferenceData
};

export type { Job } from './job.js';
export type { ErrorCode } from './errorCode.js';
