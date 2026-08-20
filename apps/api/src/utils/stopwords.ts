/**
 * One stopword list for the whole system.
 *
 * This used to be three near-identical copies — in the BM25 index, the overlap
 * scorer, and the test embedder — and they drifted. The BM25 copy was missing
 * "than", which let a record match a function word and clear the coverage floor
 * on a query it had nothing to do with. A shared list makes that class of bug
 * impossible rather than merely unlikely.
 *
 * Interrogatives (why/how/what/which) are included deliberately: they carry the
 * *shape* of a question, which the triage classifier reads as a feature, but
 * they carry no topical signal for retrieval or for grounding overlap.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // articles & determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'any', 'some', 'each',
  'every', 'no', 'all', 'both', 'either', 'neither', 'such', 'own',
  // pronouns & possessives
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them',
  'their', 'theirs', 'who', 'whom', 'whose', 'itself', 'themselves',
  // be / have / do
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'having', 'do', 'does', 'did', 'doing', 'done',
  // modals
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  // prepositions & conjunctions
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto',
  'over', 'under', 'above', 'below', 'between', 'through', 'during', 'before',
  'after', 'about', 'against', 'and', 'or', 'but', 'if', 'then', 'else',
  'than', 'because', 'while', 'when', 'where', 'as', 'so', 'though',
  'although', 'unless', 'until', 'via', 'per', 'up', 'down', 'out', 'off',
  // interrogatives & discourse
  'why', 'how', 'what', 'which', 'whether', 'there', 'here', 'also', 'just',
  'only', 'very', 'more', 'most', 'less', 'least', 'much', 'many', 'rather',
  'not', 'yes', 'please', 'thanks', 'ok', 'okay',
]);

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}
