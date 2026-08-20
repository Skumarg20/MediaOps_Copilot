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
	/** Machine-readable reason for the log's closed vocabulary. */
	code: PinCode;
}

/**
 * Anchors are resolved against real primary keys, not guessed. A token only
 * becomes an anchor if it exists in the store — which is what makes the pin a
 * fact rather than a heuristic.
 */
export async function extractAnchors({ query }: { query: string }): Promise<StructuredAnchors> {
	const [jobIds, errorCodes] = await Promise.all([
		platformService.getJobIds(),
		platformService.getErrorCodeKeys()
	]);

	const upper = query.toUpperCase();
	const foundCodes = [...errorCodes].filter((code) => upper.includes(code)).sort();

	// Numbers are only job IDs when they resolve; "1802 seconds" must not pin.
	const numbers = query.match(/\b\d{1,10}\b/g) ?? [];
	const hashed = (query.match(/#(\d{1,10})\b/g) ?? []).map((match) => match.slice(1));
	const candidates = new Set([...numbers, ...hashed]);
	const foundJobs = [...candidates].filter((candidate) => jobIds.has(candidate)).sort();

	return { jobIds: foundJobs, errorCodes: foundCodes };
}

export interface PinInput {
	anchors: StructuredAnchors;
	/** Vector path is unusable — index empty or embeddings down. */
	vectorAvailable: boolean;
	forceVectorless: boolean;
}

/**
 * Stage 1 of routing. Only the genuinely uncertain residual reaches the bandit;
 * spending exploration budget on an exact key match would be strictly worse than
 * knowing the answer.
 */
export function decidePin(input: PinInput): PinDecision {
	if (input.forceVectorless) {
		return {
			path: 'vectorless',
			reason: 'Vectorless path forced by configuration (operator override).',
			deterministic: true,
			code: 'forced_by_config'
		};
	}

	// Anchors are checked BEFORE vector availability. Both can be true at once,
	// and when they are, the exact match is the honest explanation: the query
	// would have taken this path regardless of the index's health. Reporting a
	// degradation instead would tell the operator the answer is a fallback when
	// it is in fact the best available answer.
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

	// No anchor resolved. Only now does index health decide the path — this is a
	// genuine degradation, and it is labelled as one.
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
