import { parseTurn, runReactLoop } from './reactLoop.js';
import { SYSTEM_PROMPT, buildPrompt, renderEvidenceBlock, templateAnswerFromEvidence } from './prompts.js';
import {
	GRAPH_TOOL_NAMES,
	GRAPH_TOOLS,
	PLATFORM_TOOL_NAMES,
	TOOLS,
	TOOL_NAMES,
	describeTools,
	isToolName,
	recordInvocation
} from './tools.js';

export const agentService = {
	runReactLoop,
	parseTurn,
	buildPrompt,
	renderEvidenceBlock,
	templateAnswerFromEvidence,
	recordInvocation,
	describeTools,
	isToolName
};

export { SYSTEM_PROMPT, TOOLS, TOOL_NAMES, GRAPH_TOOLS, GRAPH_TOOL_NAMES, PLATFORM_TOOL_NAMES };
export type { ParsedTurn, ReactOptions } from './reactLoop.js';
export type { Tool, ToolContext, ToolName, ToolResult } from './tools.js';
