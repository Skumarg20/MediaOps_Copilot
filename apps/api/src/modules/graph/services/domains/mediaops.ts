import { tokenize } from '@/utils/index.js';
import type { CorpusDocument, DomainDataset, GraphEdge, GraphNode, GraphSchema } from '../types.js';


export interface JobRow {
	id: string;
	status: string;
	failureReason: string | null;
	worker: string | null;
	durationS: number;
	queuedAt: string;
	jobClass: string;
	priority: string;
	submitter: string;
}

export interface ErrorCodeRow {
	code: string;
	meaning: string;
	severity: string;
	remediation: string;
}

export interface DocChunkRow {
	id: string;
	docId: string;
	heading: string;
	text: string;
}

export interface MediaOpsInput {
	jobs: JobRow[];
	errorCodes: ErrorCodeRow[];
	chunks: DocChunkRow[];
}

export const MEDIAOPS_SCHEMA: GraphSchema = {
	domain: 'mediaops',
	description:
		'Render-orchestration support: jobs execute on workers, fail with error codes, and runbook sections document how to handle them.',
	nodeTypes: [
		{ name: 'Job', description: 'A single render job with a status and a lifecycle timestamp.' },
		{ name: 'ErrorCode', description: 'A glossary entry: meaning, severity, remediation.' },
		{ name: 'Worker', description: 'A render host that jobs are assigned to.' },
		{ name: 'JobClass', description: 'Output tier — 4k, 1080p, preview.' },
		{ name: 'Submitter', description: 'The system or team that queued the job.' },
		{ name: 'DocSection', description: 'One retrievable chunk of runbook prose.' }
	],
	edgeTypes: [
		{ name: 'FAILED_WITH', from: 'Job', to: 'ErrorCode', description: 'Job terminated with this error code.' },
		{ name: 'RAN_ON', from: 'Job', to: 'Worker', description: 'Job was assigned to this worker.' },
		{ name: 'OF_CLASS', from: 'Job', to: 'JobClass', description: 'Job belongs to this output class.' },
		{ name: 'SUBMITTED_BY', from: 'Job', to: 'Submitter', description: 'Job was queued by this submitter.' },
		{ name: 'DOCUMENTS', from: 'DocSection', to: 'ErrorCode', description: 'Runbook section covers this error code.' },
		{ name: 'ADJACENT_TO', from: 'DocSection', to: 'DocSection', description: 'Neighbouring section in the same runbook.' }
	]
};

function overlapRatio(codeTerms: Set<string>, chunkTerms: Set<string>): number {
	if (codeTerms.size === 0) return 0;
	let shared = 0;
	for (const term of codeTerms) if (chunkTerms.has(term)) shared += 1;
	return shared / codeTerms.size;
}

export interface MediaOpsBuildOptions {
	linkOverlapFloor?: number;
	maxInferredLinksPerCode?: number;
}

export function buildMediaOpsDataset(
	input: MediaOpsInput,
	opts: MediaOpsBuildOptions = {}
): DomainDataset {
	const linkFloor = opts.linkOverlapFloor ?? 0.34;
	const maxInferred = opts.maxInferredLinksPerCode ?? 2;

	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	const workers = new Set<string>();
	const classes = new Set<string>();
	const submitters = new Set<string>();

	for (const job of input.jobs) {
		if (job.worker) workers.add(job.worker);
		classes.add(job.jobClass);
		submitters.add(job.submitter);

		nodes.push({
			id: `job:${job.id}`,
			type: 'Job',
			label: `job ${job.id}`,
			attrs: {
				jobId: job.id,
				status: job.status,
				failureReason: job.failureReason,
				worker: job.worker,
				durationS: job.durationS,
				queuedAt: job.queuedAt,
				jobClass: job.jobClass,
				priority: job.priority,
				submitter: job.submitter,
				failed: job.status === 'failed'
			},
			text:
				`Job ${job.id} is ${job.status}` +
				(job.failureReason ? ` with failure reason ${job.failureReason}` : '') +
				(job.worker ? ` on ${job.worker}` : '') +
				`, duration ${job.durationS} seconds, class ${job.jobClass}, priority ${job.priority}, ` +
				`submitted by ${job.submitter}, queued at ${job.queuedAt}.`
		});

		if (job.failureReason) {
			edges.push({
				type: 'FAILED_WITH',
				from: `job:${job.id}`,
				to: `errorCode:${job.failureReason}`,
				validFrom: job.queuedAt
			});
		}
		if (job.worker) {
			edges.push({ type: 'RAN_ON', from: `job:${job.id}`, to: `worker:${job.worker}`, validFrom: job.queuedAt });
		}
		edges.push({ type: 'OF_CLASS', from: `job:${job.id}`, to: `jobClass:${job.jobClass}`, validFrom: job.queuedAt });
		edges.push({
			type: 'SUBMITTED_BY',
			from: `job:${job.id}`,
			to: `submitter:${job.submitter}`,
			validFrom: job.queuedAt
		});
	}

	for (const code of input.errorCodes) {
		nodes.push({
			id: `errorCode:${code.code}`,
			type: 'ErrorCode',
			label: code.code,
			attrs: { code: code.code, severity: code.severity },
			text: `${code.code}: ${code.meaning} Severity: ${code.severity}. Remediation: ${code.remediation}`
		});
	}

	for (const worker of [...workers].sort()) {
		nodes.push({
			id: `worker:${worker}`,
			type: 'Worker',
			label: worker,
			attrs: { name: worker },
			text: `Render worker ${worker}.`
		});
	}
	for (const jobClass of [...classes].sort()) {
		nodes.push({
			id: `jobClass:${jobClass}`,
			type: 'JobClass',
			label: jobClass,
			attrs: { name: jobClass },
			text: `Job output class ${jobClass}.`
		});
	}
	for (const submitter of [...submitters].sort()) {
		nodes.push({
			id: `submitter:${submitter}`,
			type: 'Submitter',
			label: submitter,
			attrs: { name: submitter },
			text: `Job submitter ${submitter}.`
		});
	}

	const chunkTermsById = new Map<string, Set<string>>();
	for (const chunk of input.chunks) {
		chunkTermsById.set(chunk.id, new Set(tokenize(chunk.text)));
		nodes.push({
			id: chunk.id,
			type: 'DocSection',
			label: chunk.heading || chunk.docId,
			attrs: { docId: chunk.docId, heading: chunk.heading },
			text: chunk.text
		});
	}

	for (let index = 1; index < input.chunks.length; index += 1) {
		const previous = input.chunks[index - 1];
		const current = input.chunks[index];
		if (!previous || !current || previous.docId !== current.docId) continue;
		edges.push({ type: 'ADJACENT_TO', from: previous.id, to: current.id });
		edges.push({ type: 'ADJACENT_TO', from: current.id, to: previous.id });
	}

	for (const code of input.errorCodes) {
		const codeTerms = new Set(tokenize(`${code.meaning} ${code.remediation}`));
		const inferred: Array<{ chunkId: string; ratio: number }> = [];

		for (const chunk of input.chunks) {
			const terms = chunkTermsById.get(chunk.id);
			if (!terms) continue;

			if (chunk.text.includes(code.code)) {
				edges.push({
					type: 'DOCUMENTS',
					from: chunk.id,
					to: `errorCode:${code.code}`,
					weight: 1,
					attrs: { basis: 'literal_mention' }
				});
				continue;
			}

			const ratio = overlapRatio(codeTerms, terms);
			if (ratio >= linkFloor) inferred.push({ chunkId: chunk.id, ratio });
		}

		inferred
			.sort((a, b) => b.ratio - a.ratio)
			.slice(0, maxInferred)
			.forEach((entry) => {
				edges.push({
					type: 'DOCUMENTS',
					from: entry.chunkId,
					to: `errorCode:${code.code}`,
					weight: Number(entry.ratio.toFixed(3)),
					attrs: { basis: 'term_overlap' }
				});
			});
	}

	const documents: CorpusDocument[] = [...new Set(input.chunks.map((chunk) => chunk.docId))].map((docId) => ({
		id: docId,
		title: docId,
		text: input.chunks
			.filter((chunk) => chunk.docId === docId)
			.map((chunk) => chunk.text)
			.join('\n\n')
	}));

	return { schema: MEDIAOPS_SCHEMA, nodes, edges, documents };
}
