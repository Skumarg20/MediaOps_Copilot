import type { Knex } from 'knex';
import { db } from '@/connections/index.js';
import { platformService } from '@/modules/platform/index.js';
import { logEvent, type Logger } from '@/utils/index.js';
import type { Evidence } from '@/types.js';

export type ToolName = 'check_job_status' | 'restart_render';

export interface ToolResult {
	evidence: Evidence;
	/** Shown to the model as the Observation line. */
	observation: string;
}

export interface ToolContext {
	log: Logger;
	transactionId: string;
}

export interface Tool {
	name: ToolName;
	description: string;
	mutating: boolean;
	run(arg: string, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * A closed whitelist. The loop can only dispatch to a name in this registry with
 * a single string argument, so injected text cannot invent a tool or an argument
 * shape — the injection surface is the parser, and the parser accepts nothing else.
 */
export const TOOLS: Record<ToolName, Tool> = {
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

	/**
	 * Non-destructive by design. In a real deployment this is the insertion point
	 * for the human-confirmation step: the agent proposes, the operator commits.
	 * Nothing here reaches a control plane.
	 */
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

export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[];

export function isToolName(value: string): value is ToolName {
	return value in TOOLS;
}

/** Every invocation is persisted with its arguments — an auditable trail. */
export async function recordInvocation(
	{
		transactionId,
		tool,
		args,
		simulated
	}: { transactionId: string; tool: string; args: unknown; simulated: boolean },
	trx: Knex = db
): Promise<void> {
	await trx('copilot.toolInvocation').insert({
		transactionId,
		tool,
		args: JSON.stringify(args),
		simulated,
		createdAt: new Date()
	});
}
