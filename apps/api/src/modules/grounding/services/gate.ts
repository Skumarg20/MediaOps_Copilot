import { config } from '@/config.js';
import { groundingFailures } from '@/utils/index.js';
import type { ConfidenceBand, Evidence, Grounder, GroundingVerdict, HallucinationRisk } from '@/types.js';
import { validateCitations } from './citations.js';
import { lexicalOverlap } from './overlap.js';

export const ABSTENTION_ANSWER =
  "I don't know. The available evidence does not support an answer to this question. Escalate to the render-platform on-call with the job ID or error code if you have one.";

/**
 * Gates 3 and 4 of the defence-in-depth chain. Gate 1 (the retrieval floor) and
 * gate 2 (the evidence-only prompt) have already run upstream — three of the
 * four gates fire before the model can speak.
 */
export class LexicalGrounder implements Grounder {
  score(answer: string, citedIds: string[], evidence: Evidence[]): GroundingVerdict {
    const trimmed = answer.trim();

    if (trimmed.length === 0) {
      groundingFailures.inc({ reason: 'empty_answer' });
      return {
        band: 'Low',
        overlap: 0,
        validCitations: [],
        invalidCitations: [],
        grounded: false,
        reason: 'The model returned no answer text.',
      };
    }

    if (evidence.length === 0) {
      groundingFailures.inc({ reason: 'no_evidence' });
      return {
        band: 'Low',
        overlap: 0,
        validCitations: [],
        invalidCitations: [],
        grounded: false,
        reason: 'No evidence passed the retrieval floor, so nothing could support an answer.',
      };
    }

    const { valid, invalid } = validateCitations(citedIds, evidence);

    // Gate 3: a phantom citation is fatal on its own. This is not a similarity
    // judgement — the id either exists in the evidence set or it was invented.
    if (invalid.length > 0) {
      groundingFailures.inc({ reason: 'phantom_citation' });
      return {
        band: 'Low',
        overlap: 0,
        validCitations: valid,
        invalidCitations: invalid,
        grounded: false,
        reason: `Citation ${invalid[0]} does not resolve to any retrieved evidence — the answer was withheld.`,
      };
    }

    if (valid.length === 0) {
      groundingFailures.inc({ reason: 'no_citations' });
      return {
        band: 'Low',
        overlap: 0,
        validCitations: [],
        invalidCitations: [],
        grounded: false,
        reason: 'The answer cited no evidence, so none of its claims are checkable.',
      };
    }

    // Gate 4: overlap is measured against the *cited* evidence only. Scoring
    // against everything retrieved would let a model cite one item and borrow
    // support from the rest.
    const citedTexts = evidence.filter((e) => valid.includes(e.id)).map((e) => e.text);
    const overlap = lexicalOverlap(trimmed, citedTexts);

    if (overlap < config.grounding.mediumBand) {
      groundingFailures.inc({ reason: 'low_overlap' });
      return {
        band: 'Low',
        overlap,
        validCitations: valid,
        invalidCitations: [],
        grounded: false,
        reason: `Only ${(overlap * 100).toFixed(0)}% of the answer's terms appear in the cited evidence (floor ${(config.grounding.mediumBand * 100).toFixed(0)}%) — the answer was withheld.`,
      };
    }

    const band: ConfidenceBand = overlap >= config.grounding.highBand ? 'High' : 'Medium';
    const citationWord = valid.length === 1 ? 'citation resolves' : 'citations resolve';

    return {
      band,
      overlap,
      validCitations: valid,
      invalidCitations: [],
      grounded: true,
      reason:
        band === 'High'
          ? `All ${valid.length} ${citationWord} to retrieved evidence; ${overlap.toFixed(2)} lexical overlap with cited text.`
          : `All ${valid.length} ${citationWord} to retrieved evidence, but overlap is ${overlap.toFixed(2)} — paraphrased beyond the high-confidence floor. Verify before acting.`,
    };
  }
}

export function riskFromVerdict(verdict: GroundingVerdict): HallucinationRisk {
  if (!verdict.grounded) return 'high';
  return verdict.band === 'High' ? 'low' : 'medium';
}

export const grounder = new LexicalGrounder();
