import { STOPWORDS } from '@/utils/index.js';

export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

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
