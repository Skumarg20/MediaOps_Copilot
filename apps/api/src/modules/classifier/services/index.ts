import { FEATURE_LABELS, FEATURE_NAMES, URGENCY_LEXICON, extractFeatures, featureRecord, tokenize } from './features.js';
import { LogisticTriageClassifier, explainFeatures, triageClassifier } from './infer.js';

export const classifierService = {
	extractFeatures,
	featureRecord,
	tokenize,
	explainFeatures
};

export { FEATURE_LABELS, FEATURE_NAMES, URGENCY_LEXICON, LogisticTriageClassifier, triageClassifier };
export type { FeatureInput, FeatureName } from './features.js';
export type { TriageModel } from './infer.js';
