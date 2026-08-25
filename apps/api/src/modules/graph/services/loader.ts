import { platformService } from '@/modules/platform/index.js';
import { loadCorpus } from '@/modules/retrieval/services/vector.js';
import { Neo4jGraph } from './neo4jGraph.js';
import { buildCommerceDataset } from './domains/commerce.js';
import { buildMediaOpsDataset, type MediaOpsBuildOptions } from './domains/mediaops.js';
import type { DomainDataset } from './types.js';

export async function loadMediaOpsDataset(
	opts: { docsDir?: string } & MediaOpsBuildOptions = {}
): Promise<DomainDataset> {
	const [jobs, errorCodes] = await Promise.all([platformService.listJobs(), platformService.listErrorCodes()]);
	const chunks = loadCorpus(opts.docsDir);

	return buildMediaOpsDataset(
		{
			jobs: jobs.map((job) => ({
				id: job.id,
				status: job.status,
				failureReason: job.failureReason,
				worker: job.worker,
				durationS: job.durationS,
				queuedAt: job.queuedAt instanceof Date ? job.queuedAt.toISOString() : String(job.queuedAt),
				jobClass: job.jobClass,
				priority: job.priority,
				submitter: job.submitter
			})),
			errorCodes,
			chunks
		},
		opts
	);
}

export async function loadMediaOpsGraph(
	opts: { docsDir?: string } & MediaOpsBuildOptions = {}
): Promise<Neo4jGraph> {
	return Neo4jGraph.sync(await loadMediaOpsDataset(opts));
}

export async function loadCommerceGraph(): Promise<Neo4jGraph> {
	return Neo4jGraph.sync(buildCommerceDataset());
}
