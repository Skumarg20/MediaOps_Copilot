import { STOPWORDS } from '@/utils/index.js';

/**
 * Lowercased content words, with citation markers stripped first: markers are
 * formatting, not content, and counting them would let a model inflate its own
 * overlap score simply by citing more.
 */
export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/**
 * Fraction of the answer's content tokens that appear in the cited evidence.
 *
 * Chosen over an LLM self-check as the *primary* gate deliberately: a
 * self-check asks the same class of system that produced the error to detect
 * it, costs a second generation, and is unfalsifiable. This is cheap,
 * deterministic, unit-testable, and fails in the safe direction — heavy
 * paraphrase reads as low-confidence rather than invention reading as fact.
 *
 * Coverage is counted over unique tokens — types, not tokens — so repeating one
 * supported word twenty times cannot manufacture support the evidence never gave.
 */
export function lexicalOverlap(answer: string, evidenceTexts: string[]): number {
  const answerTokens = contentTokens(answer);
  if (answerTokens.length === 0) return 0;

  const evidenceVocab = new Set<string>();
  for (const text of evidenceTexts) {
    for (const token of contentTokens(text)) evidenceVocab.add(token);
  }
  if (evidenceVocab.size === 0) return 0;

  const uniqueAnswerTokens = [...new Set(answerTokens)];
  const coveredTokenCount = uniqueAnswerTokens.filter((token) => evidenceVocab.has(token)).length;

  return Number((coveredTokenCount / uniqueAnswerTokens.length).toFixed(4));
}
