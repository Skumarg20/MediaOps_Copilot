import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@/config.js';
import { buildMediaOpsDataset, DOMAIN_REGISTRY, Neo4jGraph } from '@/modules/graph/index.js';
import { loadCorpus } from '@/modules/retrieval/services/vector.js';
import { ARCHITECTURES, buildEnv, type BenchEnv } from './architectures.js';
import { scoreRun, summarise, type ArchitectureSummary, type QueryScore } from './structuralMetrics.js';
import { BENCH_QUERIES, INTENT_CATEGORIES } from './structuralQueries.js';


process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.OTEL_ENABLED = 'false';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../../ml/algorithm_comparison.md');

const MEDIAOPS_AS_OF = '2026-08-19T00:00:00Z';

type JobFixture = {
	id: string;
	status: string;
	failure_reason: string | null;
	worker: string | null;
	duration_s: number;
	queued_at: string;
	job_class: string;
	priority: string;
	submitter: string;
};

type ErrorCodeFixture = Record<string, { meaning: string; severity: string; remediation: string }>;

async function buildMediaOpsGraphOffline(): Promise<Neo4jGraph> {
	const jobs = require('../modules/platform/data/jobs.json') as JobFixture[];
	const errorCodes = require('../modules/platform/data/errorCodes.json') as ErrorCodeFixture;

	return Neo4jGraph.sync(
		buildMediaOpsDataset(
			{
				jobs: jobs.map((job) => ({
					id: job.id,
					status: job.status,
					failureReason: job.failure_reason,
					worker: job.worker,
					durationS: job.duration_s,
					queuedAt: job.queued_at,
					jobClass: job.job_class,
					priority: job.priority,
					submitter: job.submitter
				})),
				errorCodes: Object.entries(errorCodes).map(([code, body]) => ({ code, ...body })),
				chunks: loadCorpus(config.docsDir)
			},
			{ linkOverlapFloor: config.retrieval.docLinkFloor }
		)
	);
}

function table(headers: string[], rows: string[][]): string {
	const head = `| ${headers.join(' | ')} |`;
	const rule = `|${headers.map(() => '---').join('|')}|`;
	const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
	return [head, rule, body].join('\n');
}

function shorten(ids: string[], limit = 6): string {
	if (ids.length === 0) return '(nothing)';
	const shown = ids.slice(0, limit).join(', ');
	return ids.length > limit ? `${shown}, +${ids.length - limit} more` : shown;
}

async function main(): Promise<void> {
	const graphs: Record<string, Neo4jGraph> = { mediaops: await buildMediaOpsGraphOffline() };
	const envs: Record<string, BenchEnv> = { mediaops: (await buildEnv('mediaops', graphs.mediaops as Neo4jGraph, MEDIAOPS_AS_OF)) };
	const summaries_: Record<string, string> = { mediaops: 'Render operations: jobs fail with error codes on workers, and runbooks document how to handle them.' };

	for (const registration of DOMAIN_REGISTRY) {
		const graph = await Neo4jGraph.sync(registration.build());
		graphs[registration.name] = graph;
		envs[registration.name] = (await buildEnv(registration.name, graph, registration.asOf));
		summaries_[registration.name] = registration.summary;
	}

	const domainNames = Object.keys(graphs).filter((name) => BENCH_QUERIES.some((query) => query.domain === name));

	const scores: QueryScore[] = [];

	for (const query of BENCH_QUERIES) {
		const env = envs[query.domain] as BenchEnv;
		for (const architecture of ARCHITECTURES) {
			const started = performance.now();
			const run = await architecture.run(env, query);
			const elapsed = performance.now() - started;
			scores.push(await scoreRun(query, env.graph, architecture.name, run, elapsed));
		}
	}

	const summaries: ArchitectureSummary[] = ARCHITECTURES.map((architecture) =>
		summarise(architecture.name, BENCH_QUERIES, scores)
	);

	const labelOf = new Map(ARCHITECTURES.map((architecture) => [architecture.name, architecture.label]));
	const scoreFor = (queryId: string, architecture: string): QueryScore =>
		scores.find((score) => score.queryId === queryId && score.architecture === architecture) as QueryScore;

	const lines: string[] = [];

	lines.push('# Retrieval architecture comparison — generated results');
	lines.push('');
	lines.push(
		`Generated ${new Date().toISOString()} by \`src/eval/runArchitectures.ts\`. ` +
			'Deterministic; the graph is read from Neo4j (no model runtime, no API keys). Sync it first with npm run graph:sync. ' +
			'Re-run with `npm run eval:architectures --workspace=apps/api`.'
	);
	lines.push('');
	lines.push(
		'**Scope.** This compares *retrieval architecture*, not end-to-end answer quality. ' +
			'Each row produces an entity set; no generation happens, so nothing here is confounded ' +
			'by which language model wrote the prose. The planner rows use a deterministic ' +
			'intent-to-operator planner rather than a live LLM, which removes tool-selection error ' +
			'and makes them an **upper bound** on what an LLM planner would achieve with the same vocabulary.'
	);
	lines.push('');

	lines.push('## Corpora');
	lines.push('');
	lines.push(
		table(
			['Domain', 'Nodes', 'Edges', 'Types', 'Queries', 'What it is'],
			domainNames.map((domain) => {
				const graph = graphs[domain] as Neo4jGraph;
				return [
					domain,
					String(graph.nodeCount),
					String(graph.edgeCount),
					String(graph.nodeTypes().length),
					String(BENCH_QUERIES.filter((query) => query.domain === domain).length),
					summaries_[domain] ?? ''
				];
			})
		)
	);
	lines.push('');
	lines.push(
		'Only `mediaops` is native to this repository, and it is the one the bespoke handlers were ' +
			'written for. **Every other domain is hold-out for every architecture** — nothing was tuned ' +
			'against them, and each has a different topology: a supply chain, a sales star, a deep ' +
			'production hierarchy, a routing network and a directed payments network.'
	);
	lines.push('');

	lines.push('## Correct answers by domain');
	lines.push('');
	lines.push('The headline of the multi-domain run: does an architecture hold up when the schema changes?');
	lines.push('');
	lines.push(
		table(
			['Architecture', ...domainNames.map((domain) => `${domain} (${BENCH_QUERIES.filter((q) => q.domain === domain).length})`), 'Total'],
			ARCHITECTURES.map((architecture) => {
				const perDomain = domainNames.map((domain) => {
					const domainQueries = BENCH_QUERIES.filter((query) => query.domain === domain);
					return summarise(architecture.name, domainQueries, scores).correct;
				});
				return [
					architecture.label,
					...perDomain.map(String),
					`**${perDomain.reduce((a, b) => a + b, 0)}**`
				];
			})
		)
	);
	lines.push('');

	lines.push('### Mean F1 by domain');
	lines.push('');
	lines.push(
		table(
			['Architecture', ...domainNames, 'Spread'],
			ARCHITECTURES.map((architecture) => {
				const perDomain = domainNames.map((domain) =>
					summarise(architecture.name, BENCH_QUERIES.filter((query) => query.domain === domain), scores).meanF1
				);
				const spread = Math.max(...perDomain) - Math.min(...perDomain);
				return [architecture.label, ...perDomain.map((value) => value.toFixed(3)), spread.toFixed(3)];
			})
		)
	);
	lines.push('');
	lines.push(
		'**Spread** is the gap between an architecture\'s best and worst domain. A large spread means ' +
			'the architecture depends on something about a particular corpus rather than on a general capability.'
	);
	lines.push('');

	lines.push('## Headline');
	lines.push('');
	lines.push(
		table(
			['#', 'Architecture', 'Origin', 'Correct', 'Partial', 'Fail', 'Mean F1', 'Mean recall', 'Orig. F1', 'Hold-out F1', 'Calls', 'ms'],
			summaries.map((summary, index) => {
				const architecture = ARCHITECTURES[index];
				return [
					`A${index + 1}`,
					architecture?.label ?? summary.architecture,
					architecture?.origin ?? '',
					String(summary.correct),
					String(summary.partial),
					String(summary.fail),
					summary.meanF1.toFixed(3),
					summary.meanRecall.toFixed(3),
					summary.originalMeanF1.toFixed(3),
					summary.holdOutMeanF1.toFixed(3),
					summary.meanCalls.toFixed(1),
					summary.meanLatencyMs.toFixed(3)
				];
			})
		)
	);
	lines.push('');
	lines.push(`Total queries: ${BENCH_QUERIES.length} (${BENCH_QUERIES.filter((q) => !q.holdOut).length} original, ${BENCH_QUERIES.filter((q) => q.holdOut).length} hold-out).`);
	lines.push('');

	lines.push('## Per-category verdicts');
	lines.push('');
	lines.push('A category counts as handled only if **every** query in it is correct — worst verdict wins.');
	lines.push('');
	lines.push(
		table(
			['Architecture', ...INTENT_CATEGORIES.filter((category) => BENCH_QUERIES.some((query) => query.category === category))],
			summaries.map((summary) => [
				labelOf.get(summary.architecture) ?? summary.architecture,
				...INTENT_CATEGORIES.filter((category) => BENCH_QUERIES.some((query) => query.category === category)).map(
					(category) => summary.byCategory[category] ?? '—'
				)
			])
		)
	);
	lines.push('');

	lines.push('## Query by query');
	lines.push('');

	for (const query of BENCH_QUERIES) {
		const env = envs[query.domain] as BenchEnv;
		const required = query.expectAbstain ? [] : await query.required(env.graph);
		const expectedTop = query.topAnswer ? await query.topAnswer(env.graph) : null;

		lines.push(`### ${query.id} — ${query.category} — ${query.domain}${query.holdOut ? ' (hold-out)' : ''}`);
		lines.push('');
		lines.push(`**Query:** \`${query.query}\``);
		lines.push('');
		lines.push(`**Why it is here:** ${query.note}`);
		lines.push('');
		lines.push(
			query.expectAbstain
				? '**Correct behaviour:** retrieve nothing and abstain.'
				: `**Ground truth (${required.length} entit${required.length === 1 ? 'y' : 'ies'}):** ${shorten(required, 12)}` +
						(expectedTop ? `\n\n**Must rank first:** \`${expectedTop}\`` : '')
		);
		lines.push('');
		lines.push(
			table(
				['Architecture', 'Verdict', 'Recall', 'F1', 'Returned', 'Missing', 'Operator calls'],
				ARCHITECTURES.map((architecture) => {
					const score = scoreFor(query.id, architecture.name);
					return [
						architecture.label,
						score.verdict.toUpperCase(),
						score.recall.toFixed(2),
						score.f1.toFixed(2),
						String(score.returned),
						query.expectAbstain ? '—' : shorten(score.missing, 4),
						score.calls === 0 ? '—' : String(score.calls)
					];
				})
			)
		);
		lines.push('');
	}

	lines.push('## The measurement gap');
	lines.push('');
	lines.push(
		'Cases where the verdict and entity-level F1 disagree — the architecture surfaced everything ' +
			'a correct answer needs, and F1 punished it for the extra correct entities it also surfaced. ' +
			'This reproduces the reference paper\'s own warning about its headline metric.'
	);
	lines.push('');

	const gaps = scores
		.filter((score) => score.verdict === 'correct' && score.f1 < 0.6)
		.sort((a, b) => a.f1 - b.f1)
		.slice(0, 15);

	lines.push(
		gaps.length === 0
			? '_No disagreements in this run._'
			: table(
					['Query', 'Architecture', 'Verdict', 'Recall', 'Precision', 'F1', 'Returned', 'Required'],
					gaps.map((score) => [
						score.queryId,
						labelOf.get(score.architecture) ?? score.architecture,
						score.verdict.toUpperCase(),
						score.recall.toFixed(2),
						score.precision.toFixed(2),
						score.f1.toFixed(2),
						String(score.returned),
						String(score.required.length)
					])
				)
	);
	lines.push('');

	fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');

	const width = Math.max(...ARCHITECTURES.map((architecture) => architecture.label.length));
	process.stdout.write(`\n${BENCH_QUERIES.length} queries over ${Object.keys(graphs).length} domains\n\n`);
	process.stdout.write(`${'architecture'.padEnd(width)}  correct  partial  fail  meanF1  holdF1  ms\n`);
	process.stdout.write(`${'-'.repeat(width)}  -------  -------  ----  ------  ------  -----\n`);
	summaries.forEach((summary, index) => {
		const label = ARCHITECTURES[index]?.label ?? summary.architecture;
		process.stdout.write(
			`${label.padEnd(width)}  ${String(summary.correct).padStart(7)}  ${String(summary.partial).padStart(7)}  ` +
				`${String(summary.fail).padStart(4)}  ${summary.meanF1.toFixed(3).padStart(6)}  ` +
				`${summary.holdOutMeanF1.toFixed(3).padStart(6)}  ${summary.meanLatencyMs.toFixed(2).padStart(5)}\n`
		);
	});
	process.stdout.write(`\nreport written to ${path.relative(process.cwd(), OUT)}\n`);
}

await main();
