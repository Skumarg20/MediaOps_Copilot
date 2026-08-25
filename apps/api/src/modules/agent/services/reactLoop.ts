import { config } from '@/config.js';
import { LlmUnavailableError, type Generator } from '@/connections/index.js';
import { getContext } from '@/context.js';
import type { Neo4jGraph } from '@/modules/graph/index.js';
import { logEvent, type Logger } from '@/utils/index.js';
import type { AgentResult, AgentStep, Evidence, ModelArm } from '@/types.js';
import { groundingService } from '@/modules/grounding/index.js';
import { buildPrompt, SYSTEM_PROMPT, templateAnswerFromEvidence } from './prompts.js';
import { describeTools, isToolName, PLATFORM_TOOL_NAMES, recordInvocation, TOOL_NAMES, TOOLS } from './tools.js';

export type ParsedTurn = {
  thought: string;
  action: string;
  toolCall: { name: string; arg: string } | null;
  isFinal: boolean;
  answer: string;
  citations: string[];
};


export function parseTurn(raw: string): ParsedTurn {
  const text = raw.trim();
  const valueAfterLabel = (label: string): string => {
    const labelledLinePattern = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, 'im');
    return labelledLinePattern.exec(text)?.[1]?.trim() ?? '';
  };

  const thought = valueAfterLabel('Thought');
  const action = valueAfterLabel('Action');

  const answerMatch = /^[ \t]*Answer[ \t]*:[ \t]*([\s\S]*?)(?=\n[ \t]*Citations[ \t]*:|(?![\s\S]))/im.exec(
    text,
  );
  const answer = (answerMatch?.[1] ?? '').trim();

  const toolMatch = /^([a-z_]+)\s*\(([\s\S]*)\)\s*$/i.exec(action);
  const parsedToolCall =
    toolMatch && isToolName(toolMatch[1] ?? '')
      ? { name: toolMatch[1] as string, arg: (toolMatch[2] ?? '').trim().replace(/^['"]|['"]$/g, '') }
      : null;

  const answersOutright = answer.length > 0;
  const toolCall = answersOutright ? null : parsedToolCall;

  const isFinal = /final_answer/i.test(action) || answersOutright;

  return {
    thought,
    action: action || (isFinal ? 'final_answer' : ''),
    toolCall,
    isFinal,
    answer,
    citations: groundingService.extractCitedIds(text),
  };
}

export type ReactOptions = {
  llm: Generator;
  log: Logger;
  transactionId: string;
  model: ModelArm;
  maxSteps?: number;
  graph?: Neo4jGraph | null;
};

function resolveGraph(explicit: Neo4jGraph | null | undefined): Neo4jGraph | null {
  if (explicit !== undefined) return explicit;
  try {
    return getContext().graph;
  } catch {
    return null;
  }
}

export async function runReactLoop(
  query: string,
  initialEvidence: Evidence[],
  opts: ReactOptions,
): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? config.agent.maxSteps;
  const graph = resolveGraph(opts.graph);
  const evidence = [...initialEvidence];
  const steps: AgentStep[] = [];
  const history: string[] = [];

  for (let step = 1; step <= maxSteps; step += 1) {
    let raw: string;
    try {
      const result = await opts.llm.generate({
        model: opts.model,
        system: SYSTEM_PROMPT,
        prompt: buildPrompt({
          query,
          evidence,
          history,
          availableTools: graph ? TOOL_NAMES : PLATFORM_TOOL_NAMES,
          toolCatalogue: describeTools(graph !== null),
        }),
      });
      raw = result.text;
    } catch (err) {
      const reason =
        err instanceof LlmUnavailableError ? err.message : 'model runtime unavailable';
      logEvent(opts.log, 'warn', 'agent.degraded', { step, reason });

      const templated = templateAnswerFromEvidence(evidence);
      return {
        answer: templated.answer,
        citedIds: templated.citedIds,
        steps,
        evidence,
        degraded: true,
        degradedReason: reason,
      };
    }

    const turn = parseTurn(raw);
    logEvent(opts.log, 'info', 'agent.step', {
      step,
      action: turn.toolCall ? turn.toolCall.name : turn.isFinal ? 'final_answer' : 'unparsed',
      thought_len: turn.thought.length,
    });

    const tool = turn.toolCall ? TOOLS[turn.toolCall.name] : undefined;
    if (turn.toolCall && tool) {
      logEvent(opts.log, 'info', 'tool.invoked', {
        tool: tool.name,
        arg: turn.toolCall.arg,
        mutating: tool.mutating,
      });
      await recordInvocation({
        transactionId: opts.transactionId,
        tool: tool.name,
        args: { arg: turn.toolCall.arg },
        simulated: tool.mutating
      });

      const result = await tool.run(turn.toolCall.arg, {
        log: opts.log,
        transactionId: opts.transactionId,
        graph
      });

      if (!evidence.some((e) => e.id === result.evidence.id)) evidence.push(result.evidence);
      for (const extra of result.extraEvidence ?? []) {
        if (!evidence.some((e) => e.id === extra.id)) evidence.push(extra);
      }

      steps.push({ step, thought: turn.thought, action: turn.action, observation: result.observation });
      history.push(
        `Thought: ${turn.thought}`,
        `Action: ${turn.action}`,
        `Observation: ${result.observation}`,
      );
      continue;
    }

    if (turn.isFinal && turn.answer.length > 0) {
      const declined = /^\s*i\s*don'?t\s*know/i.test(turn.answer);

      if (!declined && turn.citations.length === 0 && evidence.length > 0 && step < maxSteps) {
        logEvent(opts.log, 'info', 'agent.step', { step, action: 'uncited_retry' });
        steps.push({ step, thought: turn.thought, action: 'final_answer_uncited' });
        history.push(
          `Thought: ${turn.thought}`,
          `Action: ${turn.action}`,
          'Observation: that answer cited no evidence and was rejected. Re-answer using only the EVIDENCE block, put the [evidence_id] after each claim, and end with a Citations: line listing those ids.',
        );
        continue;
      }

      steps.push({ step, thought: turn.thought, action: 'final_answer' });
      return {
        answer: turn.answer,
        citedIds: turn.citations,
        steps,
        evidence,
        degraded: false,
      };
    }

    steps.push({ step, thought: turn.thought, action: turn.action || 'unparsed' });
    history.push(`Thought: ${turn.thought}`, `Action: ${turn.action}`, 'Observation: reply was not in the required format; retry.');
  }

  logEvent(opts.log, 'warn', 'agent.budget_exhausted', { max_steps: maxSteps });
  return {
    answer: '',
    citedIds: [],
    steps,
    evidence,
    degraded: false,
    degradedReason: `Agent exhausted its ${maxSteps}-step budget without producing a final answer.`,
  };
}
