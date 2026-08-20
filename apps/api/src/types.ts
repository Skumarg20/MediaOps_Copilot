/**
 * The vocabulary of the whole system. Every module speaks in these terms so
 * the verification plane never needs to know where evidence came from.
 */

export type RetrievalPath = 'vector' | 'vectorless';

export type ModelArm = 'llama3.2:3b' | 'qwen2.5:3b';

export type TriageClass = 'simple_lookup' | 'complex_diagnostic' | 'urgent_incident';

export type ConfidenceBand = 'High' | 'Medium' | 'Low';

export type EvidenceSource = 'vector' | 'vectorless' | 'tool';

/**
 * The universal currency of the system. Both retrievers and every tool emit
 * these, which is what makes citation validation, grounding and the rationale
 * panel path-agnostic.
 */
export type Evidence = {
  /** "runbook-timeouts#c3" | "job:482.failure_reason" | "tool:check_job_status(482)" */
  id: string;
  source: EvidenceSource;
  /** The exact text the answer may rely on. */
  text: string;
  /** cosine / BM25 / undefined for exact hits */
  score?: number;
  meta: Record<string, unknown>;
};

export type StructuredAnchors = {
  jobIds: string[];
  errorCodes: string[];
};

export type QueryContext = {
  transactionId: string;
  triage: Triage;
  /** Job IDs / error codes the hard router resolved against real data. */
  anchors: StructuredAnchors;
};

export type DependencyStatus = {
  name: string;
  status: 'up' | 'degraded' | 'down';
  detail?: string;
  latencyMs?: number;
};

export interface Retriever {
  name: RetrievalPath;
  retrieve(query: string, ctx: QueryContext): Promise<Evidence[]>;
  health(): Promise<DependencyStatus>;
}

export type Action = {
  path: RetrievalPath;
  model: ModelArm;
};

/** Canonical arm key, e.g. "vectorless|llama3.2:3b". */
export type ActionKey = string;

export type ArmStats = {
  state: TriageClass;
  action: ActionKey;
  pulls: number;
  /** Pulls whose reward actually arrived; the N the sample-mean update divides by. */
  ratedPulls: number;
  meanReward: number;
  lastUpdated: string;
};

export type Decision = {
  action: Action;
  exploring: boolean;
  epsilon: number;
  armStats: ArmStats;
  /** Arms the bandit was allowed to consider after masking. */
  consideredArms: ActionKey[];
};

export interface Policy {
  select(state: TriageClass, allowed: Action[]): Promise<Decision>;
  update(state: TriageClass, action: Action, reward: number): Promise<ArmStats>;
  /** Provisional phase: the pull happened, the reward has not arrived yet. */
  registerPull(state: TriageClass, action: Action): Promise<ArmStats>;
  snapshot(): Promise<ArmStats[]>;
}

export type GroundingVerdict = {
  band: ConfidenceBand;
  overlap: number;
  validCitations: string[];
  invalidCitations: string[];
  grounded: boolean;
  /** Human-readable reason, surfaced verbatim in the rationale. */
  reason: string;
};

export interface Grounder {
  score(answer: string, citedIds: string[], evidence: Evidence[]): GroundingVerdict;
}

export type FeatureContribution = {
  name: string;
  value: number;
  contribution: number;
};

export type Triage = {
  class: TriageClass;
  confidence: number;
  topFeatures: FeatureContribution[];
  /** Per-class softmax scores, kept internal but useful in logs. */
  scores: Record<TriageClass, number>;
};

export type QueryMeta = {
  anchors: StructuredAnchors;
  /** Known incidents sharing the query's dominant keyword; a data lookup. */
  incidentMatchCount?: number;
};

export interface Classifier {
  predict(query: string, meta: QueryMeta): Triage;
}

export type Citation = {
  id: string;
  source: EvidenceSource;
  excerpt: string;
  score?: number;
};

export type Rationale = {
  path: {
    chosen: RetrievalPath;
    why: string;
    deterministic: boolean;
  };
  model: {
    chosen: ModelArm;
    why: string;
    exploring: boolean;
    arm_mean_reward: number;
    arm_pulls: number;
  };
  confidence: {
    band: ConfidenceBand;
    why: string;
  };
  triage: {
    class: TriageClass;
    why: string;
  };
  evidence: Array<{ id: string; excerpt: string }>;
};

export type HallucinationRisk = 'low' | 'medium' | 'high';

export type QueryResponse = {
  transaction_id: string;
  answer: string;
  retrieval_path: RetrievalPath;
  llm_used: ModelArm;
  latency_ms: number;
  grounded: boolean;
  hallucination_risk: HallucinationRisk;
  citations: Citation[];
  rationale: Rationale;
  degraded: boolean;
};

export type FeedbackResponse = {
  reward: number;
  arm: ActionKey;
  arm_mean_reward: number;
  arm_pulls: number;
};

export type TransactionRecord = {
  id: string;
  query: string;
  answer: string;
  path: RetrievalPath;
  model: ModelArm;
  triage_class: TriageClass;
  latency_ms: number;
  grounded: boolean;
  overlap_score: number;
  confidence_band: ConfidenceBand;
  hallucination_penalty: number;
  exploring: boolean;
  degraded: boolean;
  rationale: Rationale;
  citations: Citation[];
  created_at: string;
  feedback: { score: number; reward: number; created_at: string } | null;
};

export type AgentStep = {
  step: number;
  thought: string;
  action: string;
  observation?: string;
};

export type AgentResult = {
  answer: string;
  citedIds: string[];
  steps: AgentStep[];
  evidence: Evidence[];
  /** True when the answer was produced without a live model. */
  degraded: boolean;
  degradedReason?: string;
};
