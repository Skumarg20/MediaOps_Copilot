import { platformService } from '@/modules/platform/index.js';
import type { RetrievalPath, StructuredAnchors } from '@/types.js';

export type PinCode =
	| 'job_id_exact_match'
	| 'error_code_exact_match'
	| 'both_anchors_present'
	| 'vector_unavailable'
	| 'forced_by_config'
	| 'no_structured_anchor';

export interface PinDecision {
	path: RetrievalPath | null;
	reason: string;
	deterministic: boolean;
	code: PinCode;
}

export async function extractAnchors({ query }: { query: string }): Promise<StructuredAnchors> {
	const [jobIds, errorCodes] = await Promise.all([
		platformService.getJobIds(),
		platformService.getErrorCodeKeys()
	]);

	const upper = query.toUpperCase();
	const foundCodes = [...errorCodes].filter((code) => upper.includes(code)).sort();

	const numericTokens = query.match(/\b\d{1,10}\b/g) ?? [];
	const hashedNumericTokens = (query.match(/#(\d{1,10})\b/g) ?? []).map((match) => match.slice(1));
	const jobIdCandidates = new Set([...numericTokens, ...hashedNumericTokens]);
	const foundJobs = [...jobIdCandidates].filter((candidate) => jobIds.has(candidate)).sort();

	return { jobIds: foundJobs, errorCodes: foundCodes };
}

export interface PinInput {
	anchors: StructuredAnchors;
	vectorAvailable: boolean;
	forceVectorless: boolean;
}

export function decidePin(input: PinInput): PinDecision {
	if (input.forceVectorless) {
		return {
			path: 'vectorless',
			reason: 'Vectorless path forced by configuration (operator override).',
			deterministic: true,
			code: 'forced_by_config'
		};
	}

	const { jobIds, errorCodes } = input.anchors;

	if (jobIds.length > 0 && errorCodes.length > 0) {
		return {
			path: 'vectorless',
			reason: `Both a known job ID (${jobIds[0]}) and a known error code (${errorCodes[0]}) resolved against the store — the fact anchors the answer.`,
			deterministic: true,
			code: 'both_anchors_present'
		};
	}

	if (jobIds.length > 0) {
		return {
			path: 'vectorless',
			reason: `Exact match on job ID ${jobIds[0]} in the jobs table — record retrieval beats similarity here.`,
			deterministic: true,
			code: 'job_id_exact_match'
		};
	}

	if (errorCodes.length > 0) {
		return {
			path: 'vectorless',
			reason: `Exact match on error code ${errorCodes[0]} in the glossary — no embedding needed.`,
			deterministic: true,
			code: 'error_code_exact_match'
		};
	}

	if (!input.vectorAvailable) {
		return {
			path: 'vectorless',
			reason:
				'Vector index unavailable — forced onto the deterministic path. Open-ended questions may abstain until the index is back.',
			deterministic: true,
			code: 'vector_unavailable'
		};
	}

	return {
		path: null,
		reason: 'No structured anchor resolved — the path is genuinely uncertain, so the bandit chooses it.',
		deterministic: false,
		code: 'no_structured_anchor'
	};
}
