import { platformService } from '@/modules/platform/index.js';
import type { RetrievalPath, StructuredAnchors } from '@/types.js';

export type PinCode =
	| 'job_id_exact_match'
	| 'error_code_exact_match'
	| 'both_anchors_present'
	| 'structural_query'
	| 'anchor_plus_procedural'
	| 'vector_unavailable'
	| 'forced_by_config'
	| 'no_structured_anchor';

export interface PinDecision {
	path: RetrievalPath | null;
	reason: string;
	deterministic: boolean;
	code: PinCode;
}

export type StructuralIntent = 'aggregation' | 'absence' | 'degree' | 'comparison' | 'temporal' | 'what_if';

const STRUCTURAL_PATTERNS: Array<{ intent: StructuralIntent; pattern: RegExp }> = [
	{ intent: 'aggregation', pattern: /\b(how many|how much|most|fewest|count|total|top \d+|rank(?:ed|ing)?|busiest|highest|lowest|worst|average)\b/i },
	{ intent: 'absence', pattern: /\b(which\b[^?]*\b(?:no|not|never|without|missing|lacks?|lacking|unaffected|uncovered)\b|have no\b|has no\b|are not\b|is not\b|except\b|other than\b)/i },
	{ intent: 'degree', pattern: /\b(only one|exactly one|just one|a single|sole|no alternative|only supplier|only worker)\b/i },
	{ intent: 'comparison', pattern: /\b(compare|comparison|versus|vs\.?|difference between|same (?:problem|reason|issue|cause) as|both\b[^?]*\band\b)\b/i },
	{ intent: 'temporal', pattern: /\b(currently|right now|as of|since the|latest|current supplier|who supplies .* now|(?:after|before)\s+(?:the\s+)?(?:\d|\w+day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i },
	{ intent: 'what_if', pattern: /\b(what if|if\b[^?]*\b(?:is|are|were|gets?|got)\s+(?:drained|dropped|removed|lost|down|unavailable|decommissioned))\b/i }
];

const PROCEDURAL_PATTERN = /\b(how (?:do|should|can) (?:i|we)|how to|what should (?:i|we) do|fix|resolve|remediat\w*|mitigate|next steps?|safe to retry)\b/i;

export function detectStructuralIntent(query: string): StructuralIntent | null {
	for (const { intent, pattern } of STRUCTURAL_PATTERNS) {
		if (pattern.test(query)) return intent;
	}
	return null;
}

export function isProcedural(query: string): boolean {
	return PROCEDURAL_PATTERN.test(query);
}

export async function extractAnchors({ query }: { query: string }): Promise<StructuredAnchors> {
	const [jobIds, errorCodes] = await Promise.all([
		platformService.getJobIds(),
		platformService.getErrorCodeKeys()
	]);

	const upper = query.toUpperCase();
	const separatorNormalised = upper.replace(/[\s-]+/g, '_');
	const foundCodes = [...errorCodes]
		.filter((code) => upper.includes(code) || separatorNormalised.includes(code))
		.sort();

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
	query?: string;
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
	const structural = input.query ? detectStructuralIntent(input.query) : null;

	if (structural) {
		return {
			path: 'hybrid',
			reason: `The question is ${structural}-shaped: its answer is a property of how records relate, not a field on any one record. Pinned to the fused path so the graph can be traversed and counted.`,
			deterministic: true,
			code: 'structural_query'
		};
	}

	if ((jobIds.length > 0 || errorCodes.length > 0) && input.query && isProcedural(input.query)) {
		const anchor = jobIds[0] ?? errorCodes[0];
		return {
			path: 'hybrid',
			reason: `${anchor} resolves exactly, but the question asks what to do about it — the record carries the failure reason and the runbook carries the judgement. Pinned to the fused path so the answer can cite both.`,
			deterministic: true,
			code: 'anchor_plus_procedural'
		};
	}

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
			path: 'hybrid',
			reason:
				'Vector index unavailable — pinned to the fused path, which still covers both records and runbook prose through lexical search and graph traversal. Purely semantic phrasings may still abstain until the index is back.',
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
