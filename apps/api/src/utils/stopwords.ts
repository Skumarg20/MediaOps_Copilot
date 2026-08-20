const ARTICLES_AND_DETERMINERS = [
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'any', 'some', 'each',
  'every', 'no', 'all', 'both', 'either', 'neither', 'such', 'own',
];

const PRONOUNS_AND_POSSESSIVES = [
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them',
  'their', 'theirs', 'who', 'whom', 'whose', 'itself', 'themselves',
];

const BE_HAVE_AND_DO_FORMS = [
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'having', 'do', 'does', 'did', 'doing', 'done',
];

const MODALS = [
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
];

const PREPOSITIONS_AND_CONJUNCTIONS = [
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto',
  'over', 'under', 'above', 'below', 'between', 'through', 'during', 'before',
  'after', 'about', 'against', 'and', 'or', 'but', 'if', 'then', 'else',
  'than', 'because', 'while', 'when', 'where', 'as', 'so', 'though',
  'although', 'unless', 'until', 'via', 'per', 'up', 'down', 'out', 'off',
];

const INTERROGATIVES_AND_DISCOURSE = [
  'why', 'how', 'what', 'which', 'whether', 'there', 'here', 'also', 'just',
  'only', 'very', 'more', 'most', 'less', 'least', 'much', 'many', 'rather',
  'not', 'yes', 'please', 'thanks', 'ok', 'okay',
];

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
  ...ARTICLES_AND_DETERMINERS,
  ...PRONOUNS_AND_POSSESSIVES,
  ...BE_HAVE_AND_DO_FORMS,
  ...MODALS,
  ...PREPOSITIONS_AND_CONJUNCTIONS,
  ...INTERROGATIVES_AND_DISCOURSE,
]);

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}
