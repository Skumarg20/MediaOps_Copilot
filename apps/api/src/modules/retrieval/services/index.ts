import { Bm25Index } from './bm25.js';
import { chunkMarkdown } from './chunker.js';
import { mmrSelect, reciprocalRankFusion } from './fusion.js';
import { HybridRetriever } from './hybrid.js';
import { VectorRetriever, cosine, loadCorpus } from './vector.js';
import { VectorlessRetriever } from './vectorless.js';

export const retrievalService = {
	chunkMarkdown,
	loadCorpus,
	cosine,
	reciprocalRankFusion,
	mmrSelect
};

export { Bm25Index, HybridRetriever, VectorRetriever, VectorlessRetriever };
export { cosine, loadCorpus } from './vector.js';
export { mmrSelect, reciprocalRankFusion, DEFAULT_RRF_K } from './fusion.js';
export type { FusedHit, MmrCandidate, RankedList } from './fusion.js';
export type { Bm25Doc, Bm25Hit } from './bm25.js';
export type { Chunk } from './chunker.js';
