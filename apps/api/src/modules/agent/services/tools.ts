import { db, type DbOptions } from '@/connections/index.js';
import {
	OPERATORS,
	parseOperatorCall,
	type Neo4jGraph,
	type OperatorResult,
	type OperatorSpec
} from '@/modules/graph/index.js';
import { platformService } from '@/modules/platform/index.js';
import { logEvent, type Logger } from '@/utils/index.js';
import type { Evidence } from '@/types.js';

export type ToolName = string;

export interface ToolResult {
	evidence: Evidence;
	extraEvidence?: Evidence[];
	observation: string;
}

export interface ToolContext {
	log: Logger;
	transactionId: string;
	graph?: Neo4jGraph | null;
}

export interface Tool {
	name: ToolName;
	description: string;
	mutating: boolean;
	run(arg: string, ctx: ToolContext): Promise<ToolResult>;
}

const PLATFORM_TOOLS: Record<string, Tool> = {
	check_job_status: {
		name: 'check_job_status',
		description: 'Read the current record for a job id. Read-only.',
		mutating: false,
		async run(arg) {
			const jobId = arg.replace(/[^0-9]/g, '');
			const row = jobId ? await platformService.getJob({ id: jobId }) : undefined;

			if (!row) {
				const observation = `No job with id ${arg || '(empty)'} exists.`;
				return {
					observation,
					evidence: {
						id: `tool:check_job_status(${arg})`,
						source: 'tool',
						text: observation,
						meta: { tool: 'check_job_status', found: false }
					}
				};
			}

			const text =
				`Job ${row.id} status ${row.status}` +
				(row.failureReason ? `, failure reason ${row.failureReason}` : '') +
				(row.worker ? `, worker ${row.worker}` : '') +
				`, duration ${row.durationS} seconds, class ${row.jobClass}, priority ${row.priority}.`;

			return {
				observation: text,
				evidence: {
					id: `tool:check_job_status(${row.id})`,
					source: 'tool',
					text,
					meta: { tool: 'check_job_status', found: true, jobId: row.id, status: row.status }
				}
			};
		}
	},

	restart_render: {
		name: 'restart_render',
		description: 'Request a restart of a job. MOCK — records intent, mutates nothing.',
		mutating: true,
		async run(arg, ctx) {
			const jobId = arg.replace(/[^0-9]/g, '');
			const text = jobId
				? `Simulated restart request acknowledged for job ${jobId}. No real render was restarted; this is a mock control-plane call recorded for audit.`
				: `Restart request rejected: no valid job id supplied (received "${arg}").`;

			logEvent(ctx.log, 'warn', 'tool.mutation_simulated', {
				tool: 'restart_render',
				job_id: jobId || null
			});

			return {
				observation: text,
				evidence: {
					id: `tool:restart_render(${jobId || arg})`,
					source: 'tool',
					text,
					meta: { tool: 'restart_render', simulated: true, jobId: jobId || null }
				}
			};
		}
	}
};

const MAX_OPERATOR_ENTITIES = 6;

async function operatorEvidence(spec: OperatorSpec, rawArgs: string, result: OperatorResult, graph: Neo4jGraph): Promise<ToolResult> {
	const id = `graph:${spec.name}(${rawArgs.replace(/\s+/g, ' ').trim()})`;

	const rowLines = result.rows
		.slice(0, 12)
		.map((row) =>
			Object.entries(row)
				.map(([key, value]) => `${key}=${String(value)}`)
				.join(' ')
		)
		.join('\n');

	const text = [
		result.summary,
		rowLines ? `\nRows:\n${rowLines}` : '',
		result.provenance.length > 0 ? `\nPaths:\n${result.provenance.slice(0, 6).join('\n')}` : ''
	]
		.filter(Boolean)
		.join('');

	const resolved = await Promise.all(result.nodeIds.slice(0, MAX_OPERATOR_ENTITIES).map((nodeId) => graph.node(nodeId)));
	const extraEvidence: Evidence[] = resolved
		.filter((node): node is NonNullable<typeof node> => node !== undefined)
		.map((node) => ({
			id: node.id,
			source: 'hybrid' as const,
			text: node.text,
			meta: { kind: node.type, label: node.label, ...node.attrs, viaOperator: spec.name }
		}));

	return {
		observation: result.summary,
		evidence: {
			id,
			source: 'tool',
			text,
			meta: {
				tool: spec.name,
				tier: spec.tier,
				operator: result.operator,
				matched: result.nodeIds.length,
				nodeIds: result.nodeIds.slice(0, 24)
			}
		},
		extraEvidence
	};
}

function makeGraphTool(spec: OperatorSpec): Tool {
	return {
		name: spec.name,
		description: spec.description,
		mutating: false,
		async run(rawArgs, ctx) {
			const graph = ctx.graph;
			if (!graph) {
				const observation = `The ${spec.name} operator needs a knowledge graph and none is loaded.`;
				return {
					observation,
					evidence: {
						id: `graph:${spec.name}(unavailable)`,
						source: 'tool',
						text: observation,
						meta: { tool: spec.name, available: false }
					}
				};
			}

			const parsed = parseOperatorCall(`${spec.name}(${rawArgs})`);
			const args = parsed?.args ?? {};
			const missing = spec.params.filter((param) => param.required && args[param.name] === undefined);

			if (missing.length > 0) {
				const observation =
					`${spec.name} needs ${missing.map((param) => param.name).join(' and ')}. ` +
					`Call it as ${spec.name}(${spec.params.map((param) => param.name).join(', ')}).`;
				return {
					observation,
					evidence: {
						id: `graph:${spec.name}(invalid)`,
						source: 'tool',
						text: observation,
						meta: { tool: spec.name, error: 'missing_arguments' }
					}
				};
			}

			return operatorEvidence(spec, rawArgs, await spec.run(graph, args), graph);
		}
	};
}

export const GRAPH_TOOLS: Record<string, Tool> = Object.fromEntries(
	OPERATORS.map((spec) => [spec.name, makeGraphTool(spec)])
);

export const TOOLS: Record<string, Tool> = { ...PLATFORM_TOOLS, ...GRAPH_TOOLS };

export const TOOL_NAMES = Object.keys(TOOLS);
export const PLATFORM_TOOL_NAMES = Object.keys(PLATFORM_TOOLS);
export const GRAPH_TOOL_NAMES = Object.keys(GRAPH_TOOLS);

export function isToolName(value: string): boolean {
	return value in TOOLS;
}

const PLATFORM_SIGNATURES: Record<string, string> = {
	check_job_status: 'check_job_status(job_id)',
	restart_render: 'restart_render(job_id)'
};

export function describeTools(includeGraph: boolean): string {
	const lines = Object.values(PLATFORM_TOOLS).map(
		(tool) => `- ${PLATFORM_SIGNATURES[tool.name] ?? `${tool.name}(arg)`} — ${tool.description}`
	);

	if (includeGraph) {
		for (const spec of OPERATORS) {
			lines.push(`- ${spec.name}(${spec.params.map((param) => param.name).join(', ')}) — ${spec.description}`);
		}
	}

	return lines.join('\n');
}

export async function recordInvocation(
	{
		transactionId,
		tool,
		args,
		simulated
	}: { transactionId: string; tool: string; args: unknown; simulated: boolean },
	{ transaction = db }: DbOptions = {}
): Promise<void> {
	await transaction('copilot.toolInvocation').insert({
		transactionId,
		tool,
		args: JSON.stringify(args),
		simulated,
		createdAt: new Date()
	});
}
