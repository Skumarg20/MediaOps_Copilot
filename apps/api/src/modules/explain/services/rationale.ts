import { classifierService } from '@/modules/classifier/index.js';
import type {
  Citation,
  Decision,
  Evidence,
  GroundingVerdict,
  Rationale,
  RetrievalPath,
  Triage,
} from '@/types.js';
import type { PinDecision } from '@/modules/routing/index.js';

const EXCERPT_CHARS = 220;

export function excerpt(text: string, chars = EXCERPT_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= chars ? clean : `${clean.slice(0, chars - 1).trimEnd()}…`;
}

export function toCitations(evidence: Evidence[], ids: string[]): Citation[] {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  return ids
    .map((id) => byId.get(id))
    .filter((e): e is Evidence => Boolean(e))
    .map((e) => ({
      id: e.id,
      source: e.source,
      excerpt: excerpt(e.text),
      ...(e.score !== undefined ? { score: e.score } : {}),
    }));
}


export function composeRationale(input: {
  path: RetrievalPath;
  pin: PinDecision;
  decision: Decision;
  triage: Triage;
  verdict: GroundingVerdict;
  evidence: Evidence[];
  citedIds: string[];
  degradedReason?: string;
}): Rationale {
  const { decision, pin, triage, verdict } = input;

  const modelWhy = describeArm(decision, input.degradedReason);

  return {
    path: {
      chosen: input.path,
      why: pin.deterministic
        ? pin.reason
        : `${pin.reason} ${describePathChoice(decision)}`,
      deterministic: pin.deterministic,
    },
    model: {
      chosen: decision.action.model,
      why: modelWhy,
      exploring: decision.exploring,
      arm_mean_reward: Number(decision.armStats.meanReward.toFixed(2)),
      arm_pulls: decision.armStats.pulls,
    },
    confidence: {
      band: verdict.band,
      why: verdict.reason,
    },
    triage: {
      class: triage.class,
      why: classifierService.explainFeatures(triage.topFeatures),
    },
    evidence: input.evidence
      .filter((e) => input.citedIds.length === 0 || input.citedIds.includes(e.id))
      .slice(0, 5)
      .map((e) => ({ id: e.id, excerpt: excerpt(e.text) })),
  };
}

function describeArm(decision: Decision, degradedReason?: string): string {
  const { armStats, exploring, action } = decision;
  const mean = armStats.meanReward.toFixed(1);

  if (degradedReason) {
    return `${action.model} was selected, but no generation ran: ${degradedReason}`;
  }

  if (exploring) {
    return `Explore: an ε=${decision.epsilon} draw deliberately tried this arm instead of the current best (${mean} mean reward over ${armStats.pulls} pulls). Treat this answer as an experiment.`;
  }

  if (armStats.pulls === 0) {
    return `Exploit: untried arm carrying the optimistic prior (${mean}), so it is tried before any arm is abandoned.`;
  }

  return `Exploit: highest mean reward among the ${decision.consideredArms.length} allowed arms for this query class (${mean} over ${armStats.pulls} pulls).`;
}

function describePathChoice(decision: Decision): string {
  return decision.exploring
    ? `The bandit explored onto the ${decision.action.path} path.`
    : `The bandit's best arm for this class uses the ${decision.action.path} path.`;
}
