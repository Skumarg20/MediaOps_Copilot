import { extractCitedIds, validateCitations } from './citations.js';
import { ABSTENTION_ANSWER, LexicalGrounder, grounder, riskFromVerdict } from './gate.js';
import { contentTokens, lexicalOverlap } from './overlap.js';

export const groundingService = {
	extractCitedIds,
	validateCitations,
	lexicalOverlap,
	contentTokens,
	riskFromVerdict
};

export { ABSTENTION_ANSWER, LexicalGrounder, grounder, riskFromVerdict };
export { extractCitedIds, validateCitations, lexicalOverlap, contentTokens };
export type { CitationCheck } from './citations.js';
