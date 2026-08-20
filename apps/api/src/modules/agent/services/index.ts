import { parseTurn, runReactLoop } from './reactLoop.js';
import { SYSTEM_PROMPT, buildPrompt, renderEvidenceBlock, templateAnswerFromEvidence } from './prompts.js';
import { TOOLS, TOOL_NAMES, isToolName, recordInvocation } from './tools.js';

export const agentService = {
	runReactLoop,
	parseTurn,
	buildPrompt,
	renderEvidenceBlock,
	templateAnswerFromEvidence,
	recordInvocation,
	isToolName
};

export { SYSTEM_PROMPT, TOOLS, TOOL_NAMES };
export type { ParsedTurn, ReactOptions } from './reactLoop.js';
export type { Tool, ToolContext, ToolName, ToolResult } from './tools.js';
