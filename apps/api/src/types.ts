import type { Knex } from 'knex';

export type RetrievalPath = 'vector' | 'vectorless' | 'hybrid';

export type ModelArm = 'llama3.2:3b' | 'qwen2.5:3b';

export type TriageClass = 'simple_lookup' | 'complex_diagnostic' | 'urgent_incident';

export type ConfidenceBand = 'High' | 'Medium' | 'Low';

export type EvidenceSource = 'vector' | 'vectorless' | 'hybrid' | 'tool';

export type Evidence = {
  id: string;
  source: EvidenceSource;
  text: string;
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

export type ActionKey = string;

export type ArmStats = {
  state: TriageClass;
  action: ActionKey;
  pulls: number;
  ratedPulls: number;
  meanReward: number;
  lastUpdated: string;
};

export type Decision = {
  action: Action;
  exploring: boolean;
  epsilon: number;
  armStats: ArmStats;
  consideredArms: ActionKey[];
};

export interface Policy {
  select(state: TriageClass, allowed: Action[]): Promise<Decision>;
  update(state: TriageClass, action: Action, reward: number): Promise<ArmStats>;
  registerPull(state: TriageClass, action: Action): Promise<ArmStats>;
  snapshot(): Promise<ArmStats[]>;
  withTransaction(trx: Knex): Policy;
}

export type GroundingVerdict = {
  band: ConfidenceBand;
  overlap: number;
  validCitations: string[];
  invalidCitations: string[];
  grounded: boolean;
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
  scores: Record<TriageClass, number>;
};

export type QueryMeta = {
  anchors: StructuredAnchors;
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
  degraded: boolean;
  degradedReason?: string;
};
