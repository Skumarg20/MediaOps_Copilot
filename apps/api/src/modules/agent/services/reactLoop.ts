import { config } from '@/config.js';
import { LlmUnavailableError, type LlmAdapter } from '@/connections/index.js';
import { logEvent, type Logger } from '@/utils/index.js';
import type { AgentResult, AgentStep, Evidence, ModelArm } from '@/types.js';
import { groundingService } from '@/modules/grounding/index.js';
import { buildPrompt, SYSTEM_PROMPT, templateAnswerFromEvidence } from './prompts.js';
import { isToolName, recordInvocation, TOOL_NAMES, TOOLS } from './tools.js';

export type ParsedTurn = {
  thought: string;
  action: string;
  toolCall: { name: string; arg: string } | null;
  isFinal: boolean;
  answer: string;
  citations: string[];
};


/**
 * Tolerant parser. A 3B model will drift from any format eventually; the loop
 * must degrade to an honest abstention rather than crash on a malformed turn.
 *
 * When a turn contains BOTH an Action tool call and a finished Answer — which a
 * small model does routinely — the answer wins. That turn is self-contradictory
 * and the two readings are not equally safe: dispatching the tool would discard
 * an answer the model already committed to and fire a *mutating* action nobody
 * asked for, while taking the answer costs nothing, since the grounding gate
 * rejects it moments later if it turns out to be ungrounded.
 */
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

  const toolMatch = /^([a-z_]+)\s*\(\s*['"]?([^'")]*)['"]?\s*\)/i.exec(action);
  const parsedToolCall =
    toolMatch && isToolName(toolMatch[1] ?? '')
      ? { name: toolMatch[1] as string, arg: (toolMatch[2] ?? '').trim() }
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
  llm: LlmAdapter;
  log: Logger;
  transactionId: string;
  model: ModelArm;
  maxSteps?: number;
};

/**
 * Bounded by construction: a hard step cap, a per-call timeout inside the
 * adapter, and a whitelisted tool schema mean the loop cannot run away, cannot
 * call an unknown tool, and cannot exceed its latency budget.
 *
 * Budget exhaustion is not an error — it produces an honest abstention that
 * carries the hallucination penalty into the reward.
 */
export async function runReactLoop(
  query: string,
  initialEvidence: Evidence[],
  opts: ReactOptions,
): Promise<AgentResult> {
  const maxSteps = opts.maxSteps ?? config.agent.maxSteps;
  const evidence = [...initialEvidence];
  const steps: AgentStep[] = [];
  const history: string[] = [];

  for (let step = 1; step <= maxSteps; step += 1) {
    let raw: string;
    try {
      const result = await opts.llm.generate({
        model: opts.model,
        system: SYSTEM_PROMPT,
        prompt: buildPrompt({ query, evidence, history, availableTools: TOOL_NAMES }),
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

    if (turn.toolCall) {
      const tool = TOOLS[turn.toolCall.name as keyof typeof TOOLS];
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
        transactionId: opts.transactionId
      });

      if (!evidence.some((e) => e.id === result.evidence.id)) evidence.push(result.evidence);

      steps.push({ step, thought: turn.thought, action: turn.action, observation: result.observation });
      history.push(
        `Thought: ${turn.thought}`,
        `Action: ${turn.action}`,
        `Observation: ${result.observation}`,
      );
      continue;
    }

    if (turn.isFinal && turn.answer.length > 0) {
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
