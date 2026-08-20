
import { STOPWORDS } from '@/utils/index.js';

export type Bm25Doc = {
  id: string;
  text: string;
  meta: Record<string, unknown>;
};

export type Bm25Hit = Bm25Doc & {
  score: number;
  /** Distinct query terms this document actually contains. */
  matchedTerms: number;
  queryTerms: number;
  /** matchedTerms / queryTerms — how much of the question the hit addresses. */
  coverage: number;
};

const K1 = 1.5;
const B = 0.75;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export class Bm25Index {
  private docs: Array<Bm25Doc & { tokens: string[]; length: number }> = [];
  private df = new Map<string, number>();
  private avgLength = 0;

  constructor(docs: Bm25Doc[] = []) {
    if (docs.length > 0) this.build(docs);
  }

  get size(): number {
    return this.docs.length;
  }

  build(docs: Bm25Doc[]): void {
    this.docs = docs.map((d) => {
      const tokens = tokenize(d.text);
      return { ...d, tokens, length: tokens.length };
    });
    this.df = new Map();
    for (const doc of this.docs) {
      for (const term of new Set(doc.tokens)) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
    }
    const total = this.docs.reduce((a, d) => a + d.length, 0);
    this.avgLength = this.docs.length === 0 ? 0 : total / this.docs.length;
  }

  /**
   * Probabilistic IDF with the +1 shift that keeps common terms non-negative.
   */
  private idf(term: string): number {
    const n = this.docs.length;
    const df = this.df.get(term) ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, topK: number): Bm25Hit[] {
    if (this.docs.length === 0) return [];
    const terms = [...new Set(tokenize(query))];
    if (terms.length === 0) return [];

    const scored = this.docs.map((doc) => {
      let score = 0;
      let matchedTerms = 0;
      for (const term of terms) {
        const tf = doc.tokens.reduce((a, t) => (t === term ? a + 1 : a), 0);
        if (tf === 0) continue;
        matchedTerms += 1;
        const denom = tf + K1 * (1 - B + (B * doc.length) / (this.avgLength || 1));
        score += this.idf(term) * ((tf * (K1 + 1)) / denom);
      }
      return {
        id: doc.id,
        text: doc.text,
        meta: doc.meta,
        score,
        matchedTerms,
        queryTerms: terms.length,
        coverage: terms.length === 0 ? 0 : matchedTerms / terms.length,
      };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
