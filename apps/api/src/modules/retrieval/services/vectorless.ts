import { config } from '@/config.js';
import { platformService } from '@/modules/platform/index.js';
import { logEvent, logger, recordDependency, retrievalHits } from '@/utils/index.js';
import type { DependencyStatus, Evidence, QueryContext, Retriever } from '@/types.js';
import { Bm25Index, type Bm25Doc } from './bm25.js';

/**
 * Two mechanisms behind one retriever:
 *
 *  1. Exact lookup — jobs by ID, error codes by code. The evidence id is the
 *     field path (`job:482`), so the citation is verifiable by construction
 *     rather than by similarity.
 *  2. BM25 over the concatenated text of the same structured records, for
 *     keyword queries with no exact key. Also floored.
 *
 * No network, no model, no embedding — which is why this is the path the system
 * degrades *towards*.
 */
export class VectorlessRetriever implements Retriever {
	readonly name = 'vectorless' as const;
	private bm25 = new Bm25Index();

	get size(): number {
		return this.bm25.size;
	}

	/** Rebuilt from Postgres; cheap enough to call on every seed change. */
	async build(): Promise<number> {
		const [jobs, errorCodes] = await Promise.all([platformService.listJobs(), platformService.listErrorCodes()]);
		const docs: Bm25Doc[] = [];

		for (const job of jobs) {
			docs.push({
				id: `job:${job.id}`,
				text: [
					`job ${job.id}`,
					`status ${job.status}`,
					job.failureReason ? `failure reason ${job.failureReason}` : '',
					job.worker ? `worker ${job.worker}` : '',
					`duration ${job.durationS} seconds`,
					`class ${job.jobClass}`,
					`priority ${job.priority}`,
					`submitter ${job.submitter}`
				]
					.filter(Boolean)
					.join('. '),
				meta: { kind: 'job', jobId: job.id }
			});
		}

		for (const code of errorCodes) {
			docs.push({
				id: `errorCode:${code.code}`,
				text: `${code.code}. ${code.meaning} Severity ${code.severity}. Remediation: ${code.remediation}`,
				meta: { kind: 'errorCode', code: code.code, severity: code.severity }
			});
		}

		this.bm25.build(docs);
		return docs.length;
	}

	/**
	 * Two floors, because a raw score floor alone is not enough. A single
	 * corpus-wide term ("render") can carry a document over any score threshold,
	 * which is how an open-ended question like "why is my render slower than usual"
	 * gets answered with a plausible-looking error-code definition that does not
	 * address it. Requiring the hit to cover a real share of the query's content
	 * terms is what makes this path abstain instead — the outcome the routing
	 * design depends on.
	 */
	async retrieve(query: string, ctx: QueryContext): Promise<Evidence[]> {
		const exact = await this.exactHits(ctx);
		if (exact.length > 0) {
			retrievalHits.observe({ path: this.name }, exact.length);
			logEvent(logger, 'info', 'retrieval.completed', {
				path: this.name,
				mode: 'exact',
				hits: exact.length,
				top_score: 1
			});
			return exact;
		}

		const hits = this.bm25.search(query, config.retrieval.topK);

		const aboveScoreAndCoverageFloors = hits.filter(
			(hit) => hit.score >= config.retrieval.bm25Floor && hit.coverage >= config.retrieval.bm25Coverage
		);
		retrievalHits.observe({ path: this.name }, aboveScoreAndCoverageFloors.length);

		if (aboveScoreAndCoverageFloors.length === 0) {
			logEvent(logger, 'info', 'retrieval.floor_miss', {
				path: this.name,
				mode: 'bm25',
				top_score: Number((hits[0]?.score ?? 0).toFixed(4)),
				top_coverage: Number((hits[0]?.coverage ?? 0).toFixed(4)),
				floor: config.retrieval.bm25Floor,
				coverage_floor: config.retrieval.bm25Coverage
			});
			return [];
		}

		return aboveScoreAndCoverageFloors.map((hit) => ({
			id: hit.id,
			source: 'vectorless' as const,
			text: hit.text,
			score: Number(hit.score.toFixed(4)),
			meta: hit.meta
		}));
	}

	/**
	 * Anchors were already resolved against real primary keys by the hard router,
	 * so a hit here is definitionally correct — not a heuristic guess.
	 *
	 * A failure reason is a foreign key into the glossary; following it turns
	 * "job 482 failed with RENDER_TIMEOUT" into an answer that also explains it.
	 */
	private async exactHits(ctx: QueryContext): Promise<Evidence[]> {
		const out: Evidence[] = [];

		for (const code of ctx.anchors.errorCodes) {
			const row = await platformService.getErrorCode({ code });
			if (!row) continue;
			out.push({
				id: `errorCode:${row.code}`,
				source: 'vectorless',
				text: `${row.code}: ${row.meaning} Severity: ${row.severity}. Remediation: ${row.remediation}`,
				meta: { kind: 'errorCode', code: row.code, severity: row.severity, exact: true }
			});
		}

		for (const jobId of ctx.anchors.jobIds) {
			const row = await platformService.getJob({ id: jobId });
			if (!row) continue;

			const queuedAt = row.queuedAt instanceof Date ? row.queuedAt.toISOString() : String(row.queuedAt);
			const summary =
				`Job ${row.id} is ${row.status}` +
				(row.failureReason ? ` with failure reason ${row.failureReason}` : '') +
				(row.worker ? ` on ${row.worker}` : '') +
				`, duration ${row.durationS} seconds, class ${row.jobClass}, priority ${row.priority}, queued at ${queuedAt}.`;

			out.push({
				id: `job:${row.id}`,
				source: 'vectorless',
				text: summary,
				meta: {
					kind: 'job',
					jobId: row.id,
					status: row.status,
					failureReason: row.failureReason,
					worker: row.worker,
					durationS: row.durationS,
					exact: true
				}
			});

			if (row.failureReason) {
				const code = await platformService.getErrorCode({ code: row.failureReason });
				if (code && !out.some((evidence) => evidence.id === `errorCode:${code.code}`)) {
					out.push({
						id: `errorCode:${code.code}`,
						source: 'vectorless',
						text: `${code.code}: ${code.meaning} Severity: ${code.severity}. Remediation: ${code.remediation}`,
						meta: { kind: 'errorCode', code: code.code, viaJob: row.id, exact: true }
					});
				}
			}
		}

		return out;
	}

	async health(): Promise<DependencyStatus> {
		const status: DependencyStatus =
			this.bm25.size > 0
				? { name: 'vectorless_index', status: 'up', detail: `${this.bm25.size} records` }
				: { name: 'vectorless_index', status: 'degraded', detail: 'no structured records indexed' };
		recordDependency(status.name, status.status);
		return status;
	}
}
