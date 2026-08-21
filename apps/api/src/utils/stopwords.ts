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
