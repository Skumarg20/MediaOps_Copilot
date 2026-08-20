/**
 * Mirrors the API's response contract.
 *
 * The console holds no business logic — it renders what the API decided — so
 * these types are a *transcription* of the server contract, not a second
 * definition of it. The API suite has a contract test asserting the rationale
 * object it emits matches exactly these keys, because this is the seam most
 * likely to rot.
 */

export type RetrievalPath = 'vector' | 'vectorless';
export type ModelArm = 'llama3.2:3b' | 'qwen2.5:3b';
export type TriageClass = 'simple_lookup' | 'complex_diagnostic' | 'urgent_incident';
export type ConfidenceBand = 'High' | 'Medium' | 'Low';
export type HallucinationRisk = 'low' | 'medium' | 'high';

export type Citation = {
  id: string;
  source: 'vector' | 'vectorless' | 'tool';
  excerpt: string;
  score?: number;
};

export type Rationale = {
  path: { chosen: RetrievalPath; why: string; deterministic: boolean };
  model: {
    chosen: ModelArm;
    why: string;
    exploring: boolean;
    arm_mean_reward: number;
    arm_pulls: number;
  };
  confidence: { band: ConfidenceBand; why: string };
  triage: { class: TriageClass; why: string };
  evidence: Array<{ id: string; excerpt: string }>;
};

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

/** Binary rating fixed by the interface contract: 1 = helpful, 0 = unhelpful. */
export type FeedbackScore = 0 | 1;

export type FeedbackResponse = {
  reward: number;
  arm: string;
  arm_mean_reward: number;
  arm_pulls: number;
};

export type ArmStat = {
  state: TriageClass;
  action: string;
  path: RetrievalPath;
  model: ModelArm;
  pulls: number;
  rated_pulls: number;
  mean_reward: number;
  pull_share: number;
  last_updated: string;
};

export type RlStats = {
  states: TriageClass[];
  arms: ArmStat[];
  total_pulls: number;
  series: Array<{
    transaction_id: string;
    arm: string;
    state: TriageClass;
    reward: number;
    created_at: string;
  }>;
};

export type DependencyStatus = {
  name: string;
  status: 'up' | 'degraded' | 'down';
  detail?: string;
  latencyMs?: number;
};

export type HealthResponse = {
  status: 'ok' | 'degraded' | 'down';
  checks: Record<string, DependencyStatus>;
  uptime_s: number;
  version: string;
};
