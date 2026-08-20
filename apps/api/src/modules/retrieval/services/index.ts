import { Bm25Index } from './bm25.js';
import { chunkMarkdown } from './chunker.js';
import { VectorRetriever, cosine, loadCorpus } from './vector.js';
import { VectorlessRetriever } from './vectorless.js';

export const retrievalService = {
	chunkMarkdown,
	loadCorpus,
	cosine
};

export { Bm25Index, VectorRetriever, VectorlessRetriever };
export type { Bm25Doc, Bm25Hit } from './bm25.js';
export type { Chunk } from './chunker.js';
