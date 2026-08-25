import { STOPWORDS } from './stopwords.js';

export function tokenize(text: string): string[] {
  const keep = (t: string): boolean => t.length > 1 && !STOPWORDS.has(t);
  const out: string[] = [];

  for (const raw of text.toLowerCase().replace(/[^a-z0-9_\s-]/g, ' ').split(/\s+/)) {
    if (keep(raw)) out.push(raw);
    if (!/[_-]/.test(raw)) continue;

    for (const part of raw.split(/[_-]+/)) {
      if (keep(part)) out.push(part);
    }
  }

  return out;
}

export function termCoverage(queryTerms: Set<string>, text: string): number {
  if (queryTerms.size === 0) return 1;
  const terms = new Set(tokenize(text));
  let matched = 0;
  for (const term of queryTerms) if (terms.has(term)) matched += 1;
  return matched / queryTerms.size;
}
