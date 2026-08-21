import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseOutcome } from './harness.js';
import type { StrategyMetrics } from './metrics.js';

process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.OTEL_ENABLED = 'false';

const { buildContext } = await import('@/context.js');
const { closeDb } = await import('@/connections/index.js');
const { FakeLlmAdapter } = await import('@/connections/llmFake.js');
const { createAdversarialLlm } = await import('./adversarialLlm.js');
const { GOLDEN_SET } = await import('./goldenSet.js');
const { runStrategy } = await import('./harness.js');
const { computeMetrics, percent } = await import('./metrics.js');
const { renderReport } = await import('./report.js');
const { STRATEGIES } = await import('./strategies.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../../ml/eval_report.md');

const SEED = 20260821;

async function main(): Promise<void> {
	const faithful = new FakeLlmAdapter();
	const adversarial = createAdversarialLlm();
	await buildContext({ llm: faithful });

	const llmFor = (behaviour: 'faithful' | 'adversarial') =>
		behaviour === 'adversarial' ? adversarial : faithful;

	const outcomesByStrategy = new Map<string, CaseOutcome[]>();
	const metrics: StrategyMetrics[] = [];

	for (const strategy of STRATEGIES) {
		const outcomes = await runStrategy(GOLDEN_SET, strategy, SEED, llmFor);
		outcomesByStrategy.set(strategy.name, outcomes);
		metrics.push(computeMetrics(GOLDEN_SET, outcomes, strategy));
	}

	fs.writeFileSync(
		OUT,
		renderReport({
			cases: GOLDEN_SET,
			metrics,
			outcomesByStrategy,
			generatedAt: new Date().toISOString()
		}),
		'utf8'
	);

	const width = Math.max(...metrics.map((entry) => entry.label.length));
	process.stdout.write(`\ngolden set: ${GOLDEN_SET.length} cases\n\n`);
	process.stdout.write(`${'strategy'.padEnd(width)}  routing   false-ans  abstain-F1  cite-valid\n`);
	process.stdout.write(`${'-'.repeat(width)}  --------  ---------  ----------  ----------\n`);
	for (const entry of metrics) {
		process.stdout.write(
			`${entry.label.padEnd(width)}  ${percent(entry.routingAccuracy).padStart(8)}  ` +
				`${String(entry.falseAnswers).padStart(9)}  ${percent(entry.abstentionF1).padStart(10)}  ` +
				`${percent(entry.citationValidity).padStart(10)}\n`
		);
	}
	process.stdout.write(`\nreport written to ${path.relative(process.cwd(), OUT)}\n`);

	await closeDb();
}

await main();
