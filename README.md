# MediaOps Copilot

A self-optimizing support agent for a media-generation / render-orchestration platform.
It **routes before it retrieves**, **cites before it answers**, and **learns the routing
policy from production signal** rather than freezing it in code.

Runs on local models, hosted models, or a mix — `LLM_PROVIDER` decides, and nothing
downstream of the `LlmAdapter` interface changes either way.

- **Design:** [`MediaOps-Copilot-System-Design.md`](./MediaOps-Copilot-System-Design.md)
- **Build plan:** [`MediaOps-Copilot-Plan.md`](./MediaOps-Copilot-Plan.md)
- **Concept primers:** [`Learning-Guide.md`](./Learning-Guide.md)

---

## The core thesis

Support engineers ask two structurally different kinds of question:

| Question shape | Example | Correct machinery |
|---|---|---|
| **Exact / structured** — the answer is a *field* | `what does error code RENDER_TIMEOUT mean` | Deterministic lookup. Embeddings add latency and a chance of returning a *similar* row instead of the *right* one. |
| **Fuzzy / open-ended** — the answer is *explained* across prose | `why is my render slower than usual` | Semantic retrieval over runbook chunks. |

Treating both as "RAG" is wrong twice. So routing comes first, and only the genuinely
uncertain part of that decision is handed to a learner.

---

## Quick start

### Docker (everything: Postgres, Ollama, API, console)

```bash
# Optional but recommended — hosted generation, ~270 MB of local downloads
# instead of ~4.2 GB. Get a key at https://openrouter.ai/keys
echo "OPENROUTER_API_KEY=sk-or-..." > .env

docker compose up --build

# Embeddings stay local under the default hybrid runtime (~270 MB)
docker compose exec ollama ollama pull nomic-embed-text

# Only needed for LLM_PROVIDER=ollama, or as a hosted-outage fallback (~3.9 GB)
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull qwen2.5:3b
```

- Console → <http://localhost:3000>  (set `WEB_PORT=3001` if something already owns 3000)
- API → <http://localhost:8080>

Migrations run automatically from the API container's entrypoint, retrying while
Postgres finishes coming up. The API waits for Postgres — it cannot record or learn
without it — but **not** for Ollama, reporting `degraded` until the model runtime is
warm.

### Local development

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

docker compose up -d postgres     # or point .env at any Postgres
npm run migrate

npm run dev:api      # http://localhost:8080
npm run dev:web      # http://localhost:3000
```

Without Ollama running, the system degrades exactly as designed: deterministic lookups
still answer from the structured record, and open-ended questions abstain. That path is
covered by tests, not just by hope.

**Postgres is not optional.** Unlike the model runtime, it has no fallback: a service
that cannot record a decision has nothing honest to serve, so `/health` reports `down`
and `/query` returns 503. That is a deliberate asymmetry, not an oversight — see
[Failure modes](#failure-modes).

## Model runtime: local, hosted, or both

Requirement 3 asks for **two open-source models**. It does not say where the weights
run — OpenRouter, Together, Groq and Fireworks all serve `llama3.2` and `qwen2.5`. So
`LLM_PROVIDER` picks the runtime and nothing else changes: every caller is written
against the `LlmAdapter` interface, so the ReAct loop, grounding gate, bandit and routes
are identical whichever branch runs.

| `LLM_PROVIDER` | Generation | Embeddings | Local download | Needs a key |
|---|---|---|---|---|
| `hybrid` *(default)* | OpenRouter, falling back to Ollama | Ollama | ~270 MB | Yes |
| `openrouter` | OpenRouter only | Ollama | ~270 MB | Yes |
| `ollama` | Ollama | Ollama | ~4.2 GB | No |

**Why the split is a hybrid and not simply "hosted".** OpenRouter serves no embedding
endpoint, and the sizes are lopsided — `llama3.2:3b` ≈ 2.0 GB and `qwen2.5:3b` ≈ 1.9 GB
against `nomic-embed-text` ≈ 0.27 GB. Hosting generation skips 93% of the download;
hosting embeddings would mean adding a second provider and putting the vector path on
the network for the sake of 270 MB. So generation goes out and embeddings stay in.

**Arm keys are logical, never provider slugs.** The bandit stores arms as
`vectorless|llama3.2:3b` in Postgres. Model IDs are mapped to provider slugs at the edge
(`OPENROUTER_MODEL_LLAMA`), so switching provider — or a slug being retired — does not
orphan a single row of what the policy has learned.

A wrong or retired slug shows up as a **masked arm**: `availableModels()` probes the
catalogue, the bandit's existing masking logic drops the arm from its action space, and
`/health` names it. It is not a runtime error on every query that happens to draw it.

**What this costs.** AD-7 chose local models for a reason: no keys, no rate limits,
reproducible anywhere, works offline. `hybrid` gives that up for speed and disk. Setting
`LLM_PROVIDER=ollama` gets all of it back with no code change, which is why the local
path is kept working rather than deleted.

---

## Try these four queries

| Query | What it demonstrates |
|---|---|
| `what does error code RENDER_TIMEOUT mean` | Vectorless wins. Exact glossary hit in ~2 ms with a primary-key citation. The vector path would surface `RENDER_STALLED` and `UPLOAD_TIMEOUT` alongside it — a plausible near-miss. |
| `why is my render slower than usual` | Vector wins. The vectorless index holds only jobs and error codes, so it has nothing to say and abstains; cosine finds the performance-degradation runbook. Roughly one draw in five the bandit *explores* onto vectorless and you see that abstention — the design working, not a flake. |
| `why did job 482 fail` | Pinned to the record, then follows the failure reason into the glossary — the fact anchors the answer, the glossary explains the remedy. |
| `zxqv plorbnat wibble frotz` | Abstention. Nothing clears the retrieval floor, so no model is invoked at all and the answer is `I don't know`. |

Then click **Helpful / Unhelpful** and watch the RL panel move.

---

## Architecture

```
Browser ── Next.js console ──► Hono API ──► generation: OpenRouter (llama3.2 · qwen2.5)
                                   │                    ↳ falls back to local Ollama
                                   ├──────────────────► embeddings: Ollama (nomic-embed-text)
                                   │
                                   ├─► in-process vector index (chunks + embeddings)
                                   └─► Postgres
                                         platform.*  jobs · error codes      (reference, re-seeded)
                                         copilot.*   transactions · feedback ·
                                                     bandit arms · citations (learned, never rebuilt)
```

One API process hosts every plane, but each is a module behind an interface —
`Retriever`, `Policy`, `Grounder`, `Classifier` — so any one can move out of process
without a rewrite. At ~50 chunks, a vector database would add a container and a failure
mode for zero accuracy gain.

The two Postgres schemas are not tidiness. `platform` holds reference data derived from
the repo and re-seeded on every boot; `copilot` holds learned state that must never be
rebuilt. Splitting them makes "what is safe to truncate" a property of the namespace
rather than of a comment someone has to read.

### Backend conventions

The API follows the house conventions of the `dino` platform service, so the two read
the same way:

| Convention | How it shows up here |
|---|---|
| `src/modules/<domain>/{index,router,schema,services/}` | One module per bounded context; `index.ts` is a barrel, `services/index.ts` exports a single `xxxService` object |
| `src/connections/` for external systems | `db.ts` (knex/pg), `ollama.ts`, plus a barrel |
| `src/utils/` for cross-cutting helpers | `logger.ts` (pino), `metrics.ts`, `stopwords.ts` |
| knex + `knex-stringcase` | camelCase in code, snake_case in Postgres, in both directions — no column spelled twice |
| Schema-qualified tables | `db('platform.job')`, `db('copilot.transaction')` |
| tRPC router + plain-Hono REST sub-apps | `appRouter` mounted at `/trpc/*`; `queryRoutes`, `feedbackRoutes`, … mounted with `app.route()` |
| `@/*` path alias to `src/` | `tsc && tsc-alias` rewrites them at build; vitest mirrors the mapping |
| `HTTPException` + `app.onError` | Errors thrown from services, translated once at the boundary |
| Tabs, single quotes, no trailing comma, 120 cols | `.prettierrc.json` copied from the platform |

**Two deliberate departures**, both worth stating:

1. **TypeScript, not JavaScript.** The platform's modules are `.js`; this service keeps
   `.ts` throughout. The design treats `Retriever`, `Policy`, `Grounder`, and `Classifier`
   as the load-bearing seams that keep the monolith decomposable — deleting those
   interfaces to match a file extension would remove the thing that makes the structure
   work. The platform's own `tsconfig` already sets `allowJs: true` and its entrypoints
   are `.ts`, so this is inside the convention rather than against it.

2. **Migrations live in-repo.** The platform manages schema outside the service, which
   is right when a DBA owns the cluster. Here `docker compose up` is the whole setup
   story, so `apps/api/migrations/` ships with the code and the container applies it at
   start.

### The request path

```
triage ──► route ──► retrieve ──► reason ──► verify ──► explain ──► learn
   │         │          │           │          │          │           │
   │         │          │           │          │          │           └─ provisional arm update
   │         │          │           │          │          └───────────── rationale object
   │         │          │           │          └──────────────────────── citation + overlap gates
   │         │          │           └─────────────────────────────────── bounded ReAct loop
   │         │          └─────────────────────────────────────────────── floored retrieval
   │         └────────────────────────────────────────────────────────── hard rules, then bandit
   └──────────────────────────────────────────────────────────────────── logistic regression
```

---

## How each requirement is met

| # | Requirement | Where | Notes |
|---|---|---|---|
| 1 | `POST /query`, `POST /feedback` | `modules/query/`, `modules/feedback/` | zod-validated; 400/404/409/503 all meaningful. Also exposed over tRPC |
| 2 | Vector **and** vectorless retrieval | `modules/retrieval/` | Two retrievers behind one interface; documented decision table |
| 3 | ReAct loop, ≥2 open models | `modules/agent/` | Thought→Action→Observation; `llama3.2:3b` and `qwen2.5:3b` as selectable arms |
| 4 | Online RL | `modules/rl/` | ε-greedy contextual bandit, arm stats persisted to Postgres |
| 5 | Hallucination handling | `modules/grounding/` | Four gates; three fire before the model speaks |
| 6 | Classical ML | `ml/` + `modules/classifier/` | scikit-learn trains offline → JSON weights → Node infers |
| 7 | Explainability | `modules/explain/` | `rationale` on every response, rendered in the console |
| 8 | Ops console | `apps/web` | Transaction feed, rationale panel, live RL chart, health pill |
| 9 | CI/CD | `.github/workflows/ci.yml` | lint → test (with Postgres) → docker build → gated deploy |
| 10 | Test automation | `apps/*/test*` | 153 tests; RL logic gets the most scrutiny |
| 11 | SRE & observability | `src/utils/` | JSON logs keyed by `transaction_id`, real `/health` probes, `/metrics` |

---

## Routing

**Stage 1 — deterministic.** A token that resolves to a real primary key (a job ID in
`jobs`, an error code in `error_codes`) pins the path to vectorless. This is not a
heuristic guess; it is an exact match against real data, and cosine similarity cannot
beat it.

Note the ordering: anchors are checked **before** index health. When both apply, the
exact match is the honest explanation — the query would have taken that path regardless
of whether the vector index was up.

**Stage 2 — learned.** For everything else the path is genuinely uncertain, so it joins
the bandit's action space alongside the model choice.

| Signal | Path | Why |
|---|---|---|
| Query contains an existing job ID | Vectorless (pinned) | Exact record retrieval |
| Query contains a known error code | Vectorless (pinned) | A glossary hit is definitionally correct |
| Short keyword/entity lookup | Vectorless (bandit-preferred) | BM25 over structured records is fast and precise |
| Open-ended "why / how / should I" | Vector (bandit-preferred) | Answer is distributed across prose |
| Vector store unavailable | Vectorless (forced) | Degradation |

### Two floors on the keyword path

BM25 applies a **score** floor *and* a **coverage** floor. The score floor alone is not
enough: one corpus-wide term (`render`) can drag an irrelevant record over any
threshold, which is how `why is my render slower than usual` ends up answered with a
plausible-looking `RENDER_TIMEOUT` definition that does not address it. Requiring a hit
to cover a real share of the query's content terms is what makes this path abstain
instead — the behaviour the routing design depends on.

---

## Reinforcement learning

|  |  |
|---|---|
| **State** | Triage class — `simple_lookup` \| `complex_diagnostic` \| `urgent_incident` |
| **Action** | `(path, model)` ∈ `{vector, vectorless} × {llama3.2, qwen2.5}` — 4 arms, **masked to 2** when a rule pins the path |
| **Policy** | ε-greedy, ε = 0.2 decaying to 0.05 as pulls accumulate |
| **Reward** | `R = 10·feedback − latency_seconds − hallucination_penalty` |
| **Update** | Incremental sample mean, `Q ← Q + (R − Q)/N` |

The `10×` weight makes helpfulness dominate and latency the tie-breaker between paths of
equal quality. Rewards are **legitimately negative** and nothing clamps at zero.

**Two-phase update.** Feedback is asynchronous and may never arrive:

- **Provisional** (end of `/query`) — latency and the grounding verdict are recorded, and
  the pull count increments so exploration accounting stays honest.
- **Terminal** (`POST /feedback`) — the full reward folds into `Q(s,a)`; a second click
  is a 409 and touches nothing.

Unrated transactions contribute a pull but no reward estimate. Silence is read as
neither approval nor disapproval.

Cold start uses **optimistic initialisation** (`Q₀ = 5.0`), which guarantees every arm is
tried before any is abandoned — no separate warm-up mode. The first *rated* pull replaces
the prior outright rather than averaging against a number nobody observed.

---

## Hallucination control

Four independent gates, three of which run **before** the model can speak.

1. **Retrieval floor** — below the similarity/BM25 threshold, no evidence is returned and
   no LLM call is made at all.
2. **Constrained prompt** — evidence-only instruction; retrieved text is delimited as
   *data*, never as instruction.
3. **Citation validation** — every cited ID must exist in the evidence set. String match,
   not model judgement. This catches fabricated sources **with certainty**.
4. **Lexical overlap** — token overlap between the answer and the *cited* evidence only.

| Overlap | Band | Behaviour |
|---|---|---|
| ≥ 0.45 | High | Answer shown |
| 0.25 – 0.45 | Medium | Answer shown with a caution marker |
| < 0.25 | Low | **Abstain** |

**Why lexical overlap rather than an LLM self-check as the primary gate.** A self-check
asks the same class of system that produced the error to detect it, costs a second
generation, and is unfalsifiable. Overlap is cheap, deterministic, unit-testable, and
fails in the safe direction.

**Abstention is a first-class outcome.** `I don't know` returns **HTTP 200** with
`grounded: false`, flows through the same rating and reward path as any other answer, and
still costs the arm its penalty — so the policy learns to prefer paths that produce
*verifiable* answers, not merely confident ones.

---

## Triage classifier

Multinomial logistic regression over 8 interpretable features. Linearity is what makes
the feature-level explanation honest rather than a story.

```bash
npm run ml:dataset        # regenerate ml/synthetic_dataset.csv from features.ts
npm run ml:train:python   # scikit-learn (reference trainer)
npm run ml:train          # pure-Node fallback, no Python required
```

Both trainers read the **same numeric feature columns** and emit the **same
`model.json` schema**. The dataset is generated by running the production feature
extractor, so training/serving skew is structurally impossible rather than merely
unlikely — and `infer.ts` asserts the loaded model matches the compiled feature contract
at boot.

Latest held-out results are in [`ml/metrics_report.md`](./ml/metrics_report.md)
(accuracy **0.962**, macro F1 **0.965**). That number deserves its caveat, which the
report states in full: the data is templated, so the classifier is learning the
generator's vocabulary, not real operator language. The report derives its confusion
commentary from the matrix the run actually produced rather than asserting the error mode
we predicted.

> **Note.** `model.json` and `metrics_report.md` in this repo were produced by the Node
> fallback trainer, because Python was not available on the build machine. The
> scikit-learn script is the reference trainer and is what CI runs.

---

## Explainability

Every response carries a `rationale` built from decisions already recorded — no post-hoc
reconstruction, no second model call:

```jsonc
{
  "path":  { "chosen": "vectorless", "why": "Exact match on job ID 482 in the jobs table…", "deterministic": true },
  "model": { "chosen": "qwen2.5:3b", "why": "Exploit: highest mean reward (7.4 over 12 pulls).", "exploring": false, … },
  "confidence": { "band": "High", "why": "All 2 citations resolve; 0.62 lexical overlap." },
  "triage": { "class": "complex_diagnostic", "why": "Flagged by: contains 'why' (+1.8)…" },
  "evidence": [ { "id": "error_codes:RENDER_TIMEOUT", "excerpt": "Raised when a worker exceeds…" } ]
}
```

**The principle:** explain every decision that would change what the operator *does* with
the answer; keep internal everything that would only change what an engineer does with
the *system*. Cosine values, ε schedules, and the full coefficient matrix stay out.

---

## API

| Route | tRPC equivalent | Purpose |
|---|---|---|
| `POST /query` | `query.ask` | Ask. Returns answer, path, model, latency, grounding, citations, rationale |
| `POST /feedback` | `feedback.rate` | Rate. Returns the recomputed arm statistics |
| `GET /transactions?limit=n` | `transaction.list` | Console feed |
| `GET /rl/stats` | `rl.stats` | Per-arm pulls, mean reward, reward time series |
| `GET /health` | `health.check` | Real dependency probes |
| `GET /metrics` | — | Prometheus text exposition |

Both surfaces call the same service functions — there is no second implementation to
drift. REST is the pinned contract (`POST /query` must be callable with plain curl);
tRPC exists because it is how the platform's clients talk to it, and it gives the console
end-to-end types when it wants them.

<details>
<summary><code>POST /query</code></summary>

```jsonc
// request
{ "query": "why did job 482 fail" }

// 200
{
  "transaction_id": "b1f0…",
  "answer": "Job 482 is failed with failure reason RENDER_TIMEOUT on worker-07… [job:482]",
  "retrieval_path": "vectorless",
  "llm_used": "llama3.2:3b",
  "latency_ms": 940,
  "grounded": true,
  "hallucination_risk": "low",
  "citations": [{ "id": "job:482", "source": "vectorless", "excerpt": "…" }],
  "rationale": { /* above */ },
  "degraded": false
}
```

`400` invalid body · `503` no path and no model available — *including* a grounded
abstention at `200`, because "I don't know" is a correct answer.
</details>

<details>
<summary><code>POST /feedback</code></summary>

```jsonc
{ "transaction_id": "b1f0…", "score": 1 }   // → { "reward": 8.06, "arm": "vectorless|llama3.2:3b", "arm_mean_reward": 7.4, "arm_pulls": 13 }
```

`404` unknown transaction · `409` already rated (idempotent, policy untouched).
</details>

---

## Observability

**Logs.** One JSON line per event, with `transaction_id` bound to a child logger at
request entry. Grepping one ID replays the entire decision path:

```jsonc
{"event":"triage.classified","transaction_id":"b1f0…","class":"simple_lookup","confidence":0.91}
{"event":"router.decided","transaction_id":"b1f0…","path":"vectorless","reason":"error_code_exact_match"}
{"event":"bandit.selected","transaction_id":"b1f0…","action":"vectorless|llama3.2:3b","exploring":false}
{"event":"retrieval.completed","transaction_id":"b1f0…","hits":1,"ms":3}
{"event":"grounding.failed","transaction_id":"b1f0…","overlap":0.18,"decision":"abstain"}
{"event":"rl.updated","transaction_id":"b1f0…","reward":-2.1,"new_mean":3.9,"pulls":9}
```

Event names are a **closed vocabulary** (`triage.* router.* bandit.* retrieval.* agent.*
grounding.* rl.* dep.*`), so alerts key on stable fields rather than message regexes.

**Metrics.** `copilot_requests_total`, `copilot_request_duration_seconds`,
`copilot_retrieval_hits`, `copilot_grounding_failures_total`, `copilot_rl_reward`,
`copilot_rl_pulls_total`, `copilot_dependency_up`.

**Health.** Probes Postgres (`select 1`), the vector index, and both Ollama model tags.
Postgres down is **fatal** → `503`. Everything else is **degraded** → `200`, so a load
balancer sheds only genuinely dead instances while a degraded one keeps serving.

### If this broke at 3am

1. **`GET /health`** — which dependency flipped? Ollama down is the common case; the
   symptom is every answer on the vectorless path with `degraded: true`.
2. **`GET /metrics`** — is `copilot_grounding_failures_total` climbing? A spike with
   healthy dependencies means retrieval quality regressed, not an outage.
3. **Latency by `path` label** — if only `path="vector"` degraded, suspect the embedding
   endpoint, not the whole runtime.
4. **Grep one bad `transaction_id`** — six log lines replay the full decision path.
5. **`copilot_rl_reward` by arm** — one arm collapsing means one model regressed; all
   arms collapsing means the problem is upstream of the policy.
6. **Mitigate** — `FORCE_VECTORLESS=1` and restart. The index rebuilds from the corpus at
   boot and bandit state survives in SQLite, so no learning is lost.

---

## Failure modes

The contract: **degrade to a narrower but still-grounded answer, or abstain — never
crash, never guess.**

| Failure | Behaviour | Operator sees |
|---|---|---|
| Hosted provider unreachable / rate-limited | Generation retries on the local Ollama runtime | Answer served normally; `/health` notes the hosted provider is degraded |
| Both runtimes unreachable | Vectorless returns the raw record as a templated answer, no generation | `degraded: true`, rationale explains why |
| One model tag missing | Action space masked to the healthy model; the arm is **not** penalised | The surviving arm |
| Embedding model down | Vector path disabled, all queries forced vectorless | Amber pill; open-ended queries may abstain |
| Retrieval below floor | Abstain + escalation hint, penalty applied | Amber "I don't know" row |
| Phantom citation | Answer replaced by abstention | Explanation naming the invalid citation |
| Agent budget exhausted | Abstain rather than force an answer | Rationale states the budget |
| Postgres unavailable | `503` — nothing can be recorded or learned, so serving would be dishonest | Red pill |
| Duplicate feedback | `409`, policy untouched | Button disabled after first click |

**The load-bearing invariant:** degradation always moves *toward* determinism —
vector → vectorless → structured template → abstention. Every rung down that ladder is
more verifiable than the one above it, so a degraded system is a *more* conservative one,
never a less trustworthy one.

---

## Tests

```bash
docker compose up -d postgres
createdb -h localhost -U copilot mediaops_test    # or set TEST_DB_DATABASE

npm test                          # both workspaces
npm run test --workspace=apps/api
npm run test --workspace=apps/web
```

**153 tests.** No Ollama required — a deterministic fake adapter and a hand-authored
concept-space embedder make agent and retrieval tests fast and non-flaky.

**Postgres is required for 63 of them.** The bandit's correctness depends on
`on conflict`, `returning`, and atomic increments; the store depends on jsonb
round-tripping. A fake would agree with whatever the code does and prove none of it —
so those suites run against a real database, each taking its own scratch schema pair
and dropping it afterwards. Without a database they **skip with a printed reason**
rather than failing, and CI asserts that they did *not* skip: a green run that tested
nothing is worse than a red one. All 136 API tests have been run green against a real
Postgres 16, and the full path verified end to end against hosted llama-3.2-3b and
qwen-2.5-7b through OpenRouter.

| Suite | Tests | Needs PG | Covers |
|---|---|---|---|
| `bandit` | 23 | 14 | Reward arithmetic incl. negatives; incremental-mean correctness; ε=0 exploits, ε=1 explores; optimistic init sweeps every arm; masking survives ε=1; per-state independence; persistence across restarts |
| `api` | 27 | all | Route contracts; 400/404/409; the rationale shape the console destructures; jsonb round-trip fidelity; **Ollama down → 200 + `degraded`**; empty index → forced vectorless; the tRPC surface |
| `retrieval` | 26 | 11 | Both canonical examples; both floors; anchor resolution; hard-rule ordering |
| `grounding` | 20 | — | Phantom citation → abstain; High/Medium banding; overlap cannot be inflated by repetition |
| `agent` | 16 | 11 | ReAct parsing; multi-line answers; tool whitelist; step budget; prompt-injection containment |
| `classifier` | 13 | — | Feature contract; per-class prediction; signed attributions |
| `web` | 17 | — | Optimistic feedback + rollback; rationale panel; abstention styling |

---

## Configuration

Every knob has a safe default; the service starts with no environment at all.

See [`apps/api/.env.example`](./apps/api/.env.example) for the full annotated list.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | API port |
| `PROJECT_ENV` | `development` | `production` widens the connection pool to 50 |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | Postgres location |
| `DB_USER` / `DB_PASSWORD` | `copilot` / `copilot` | Postgres credentials |
| `DB_DATABASE` | `mediaops` | Database name |
| `DB_SSL` | `false` | `true` for managed Postgres terminating TLS with its own CA |
| `TEST_DB_DATABASE` | `mediaops_test` | Database the integration suites use |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Model runtime |
| `FORCE_VECTORLESS` | `false` | 3am override — pin the deterministic path |
| `VECTOR_SIMILARITY_FLOOR` | `0.45` | Below this, no evidence |
| `BM25_SCORE_FLOOR` | `1.2` | Keyword score floor |
| `BM25_COVERAGE_FLOOR` | `0.5` | Share of query terms a hit must cover |
| `RL_EPSILON_START` / `_FLOOR` | `0.2` / `0.05` | Exploration schedule |
| `RL_HALLUCINATION_PENALTY` | `5.0` | Charged at answer time |
| `GROUNDING_HIGH_BAND` | `0.45` | High-confidence overlap threshold |
| `LOG_LEVEL` | `info` | pino level |
| `LLM_PROVIDER` | `hybrid` | `hybrid` | `openrouter` | `ollama` |
| `OPENROUTER_API_KEY` | unset | Required by `hybrid` and `openrouter` |
| `WEB_PORT` | `3000` | Host port for the console |
| `OPERATOR_KEY` | unset | When set, tRPC `operatorProcedure` requires `x-operator-key` |

No secrets exist beyond the database password. The local-model choice removes the entire
API-key surface.

---

## Security & safety

- **Prompt injection** — retrieved text is delimited as data; the tool schema is a closed
  whitelist, so injected text cannot invent a tool or an argument shape. Covered by test.
- **Destructive actions** — `restart_render` is a non-destructive mock that records intent
  and mutates nothing. A real deployment needs a human-confirmation step first: the agent
  proposes, the operator commits.
- **Model output as untrusted input** — answers render as text, never HTML; citation IDs
  are validated against a known set before use.
- **Input validation** — zod at every boundary; parameterised SQL only; job IDs and error
  codes matched against known keys, never interpolated.
- **PII** — queries are stored verbatim for the RL loop and could contain incident
  details. Production would need a retention policy and access control on
  `/transactions`. Called out rather than silently ignored.
- **Auth** — out of scope for a single-operator console. The insertion point is Hono
  middleware in front of all routes, with `/health` and `/metrics` on a separate internal
  listener.

---

## What is still needed to run this

Everything in the repo compiles, lints, and builds. These are the external pieces the
code cannot provide for itself.

| # | Needed | Why | How |
|---|---|---|---|
| 1 | **Docker Desktop running** | Postgres and Ollama both ship as compose services | Start Docker Desktop, then `docker compose up --build` |
| 2 | **A reachable Postgres** | No fallback exists by design — see [Failure modes](#failure-modes) | `docker compose up -d postgres`, or point `apps/api/.env` at any instance |
| 3 | **Migrations applied** | Tables live in the database, not the image | Automatic in Docker (entrypoint). Locally: `npm run migrate` |
| 4 | **`.env` files** | `.env.example` is committed; `.env` is not | `cp apps/api/.env.example apps/api/.env` (and the same for `apps/web`) |
| 5 | **An OpenRouter key** (default runtime) | `LLM_PROVIDER=hybrid` needs one; without it the API warns and runs fully local | Put `OPENROUTER_API_KEY=sk-or-...` in a `.env` beside `docker-compose.yml` |
| 6 | **`nomic-embed-text` pulled** (~270 MB) | Embeddings stay local in every mode; without it the vector path is disabled | `docker compose exec ollama ollama pull nomic-embed-text` |
| 7 | **The two generation models** (~3.9 GB, optional) | Only for `LLM_PROVIDER=ollama`, or as a hosted-outage fallback | `docker compose exec ollama ollama pull llama3.2:3b` and `qwen2.5:3b` |
| 8 | **A test database** | The Postgres-backed tests skip without it | `createdb mediaops_test`, or set `TEST_DB_DATABASE` |
| 9 | **Python + scikit-learn** (optional) | Only to re-run the *reference* trainer | `pip install -r ml/requirements.txt`. The committed model came from the Node fallback trainer |

Fastest path from a clean clone:

```bash
npm install
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env
docker compose up --build          # postgres + ollama + api + web, migrations included
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull qwen2.5:3b
docker compose exec ollama ollama pull nomic-embed-text
open http://localhost:3000
```

## Known limits

Stated plainly, because a system that claims to never guess should not guess about itself.

- **Classifier accuracy is not evidence about production.** Templated data, learned
  vocabulary. The confusion matrix is the informative part.
- **RL convergence needs tens of ratings per state.** A short demo shows the mechanism
  working, not a converged policy.
- **Lexical overlap penalises legitimate paraphrase.** It fails safe — a good answer can
  land in Medium — but it is a proxy for entailment, not entailment. NLI is the documented
  upgrade.
- **The pull count includes unrated pulls**, so `N` in the incremental mean drifts above
  the number of rewards actually observed. Deliberate: exploration accounting stays
  honest, at the cost of slightly damping later updates.
- **Open-ended synthesis is where the 3B arms actually differ — measured, not assumed.**
  Over 10 live draws of `why is my render slower than usual`: `vector|qwen2.5:3b`
  grounded 2 of 3, `vector|llama3.2:3b` grounded 0 of 2, and every `vectorless` draw
  abstained (0 of 5 — correct, the path holds no runbook prose). Llama tends to answer
  "your render is slower due to [chunk]" — it restates the question and points at a
  document instead of synthesizing the three causes, and the overlap gate refuses it as
  vacuous. This is the distinction the bandit exists to find, and it is a real one:
  with feedback the policy should converge on `vector|qwen2.5:3b` for this query class.
- **Anchored queries ground reliably; open-ended ones do not yet.** Same session,
  hosted generation: `what does error code RENDER_TIMEOUT mean` and `why did job 482
  fail` grounded 7 of 7 at High confidence, 0.7–2.1 s.
- **Two prompt/parser defects only live models surfaced.** llama-3.2-3b emitted
  `Action: restart_render(482)` *and* a complete cited answer in one turn on a purely
  diagnostic question — the parser dispatched the mutating tool and discarded the
  answer. It also invented `evidence:RENDER_TIMEOUT` for an id it had been handed as
  `errorCode:RENDER_TIMEOUT`. Both are fixed (answer wins over a contradictory tool
  call; the prompt now restates the valid ids as a closed list) and both are covered by
  tests using the verbatim output.
- **The canonical vector example needed a corpus fix that real embeddings exposed.**
  `why is my render slower than usual` originally retrieved `architecture-faq#c5`
  (0.672) and `runbook-timeouts-and-retries#c0` (0.647) instead of the
  performance-degradation runbook. The cause was mine: I had stripped every symptom
  word from that runbook so BM25 would demonstrably fail, which also put it out of
  reach of `nomic-embed-text`. Adding a "what this looks like when it is reported"
  section — the framing a real runbook has — fixed it, and could not affect the
  vectorless claim because that index holds only jobs and error codes, never runbook
  prose. The concept-space test embedder had ranked it correctly all along, which is
  exactly the kind of thing a fake cannot catch.
- **The demo is deliberately non-deterministic.** Roughly one draw in five, the bandit
  explores onto the vectorless path for that query and abstains. That is the design
  working, not a flake — but it means "run it once and look" can show either outcome.
- **The bandit's read-modify-write is not yet atomic.** `update()` reads the current mean
  and writes the new one in two statements. Single-process that is fine; with concurrent
  replicas two simultaneous ratings for the same arm could interleave and lose one. The
  fix is a single `update … set mean_reward = mean_reward + (? - mean_reward) / pulls`
  statement, which Postgres now makes possible — it was not, on SQLite.
- **The test embedder is a hand-authored concept space**, not a learned one. It exists so
  CI can exercise the vector path deterministically without a model runtime — it is not a
  substitute for `nomic-embed-text` at runtime.

---

## Repo layout

```
apps/
  api/                          Hono + tRPC + knex/Postgres, TypeScript
    migrations/                 schemas · platform tables · copilot tables
    knexfile.js
    .env.example
    src/
      index.ts                  Hono app, appRouter, REST mounts, boot
      trpc.ts                   router · publicProcedure · operatorProcedure
      context.ts                composition root (llm · retrievers · bandit · grounder)
      config.ts
      connections/              db (knex/pg) · ollama · llm.types · llmFake
      utils/                    logger · metrics · stopwords
      scripts/                  generateDataset
      modules/
        platform/               job · errorCode · seed  + data/ (fixtures, mockDocs)
        query/                  router · schema · services/pipeline
        feedback/               router · schema · services/feedback
        transaction/            router · schema · services/store
        rl/                     router · services/{bandit,reward,state}
        retrieval/              services/{vector,vectorless,bm25,chunker}
        agent/                  services/{reactLoop,tools,prompts}
        grounding/              services/{gate,citations,overlap}
        classifier/             services/{infer,features} · model.json
        routing/                services/rules (hard routing + anchors)
        explain/                services/rationale
        health/                 router · services/health
    test/                       bandit · api · retrieval · grounding · agent ·
                                classifier · helpers/db
  web/                          Next.js App Router console
    .env.example
    components/                 QueryBox · TransactionTable · TransactionRow ·
                                RationalePanel · FeedbackButtons · RLPanel · StatusPill
ml/                             train_triage_classifier.py · train_fallback.mjs ·
                                synthetic_dataset.csv · metrics_report.md
.github/workflows/ci.yml        lint → test (Postgres) → docker build → gated deploy
docker-compose.yml              postgres + ollama + api + web
```

---

## Key design decisions

| # | Decision | Why |
|---|---|---|
| AD-1 | Deterministic rules first, bandit for the residual | An exact key match is *knowledge*, not a hypothesis. Spending exploration budget on it would be strictly worse. |
| AD-2 | Joint action `(path, model)`, path-masked when pinned | The two interact — a terse model suits exact lookups, a verbose one suits multi-chunk synthesis. Masking keeps the deterministic guarantee intact under exploration. |
| AD-3 | Tabular ε-greedy over LinUCB | 3×4 converges in tens of samples, which is what a demo can actually produce. LinUCB is the documented upgrade path, not the starting point. |
| AD-4 | Overlap + citation validation as the primary gate | Deterministic, unit-testable, no extra generation, fails safe. Citation validation catches fabricated sources with certainty. |
| AD-5 | scikit-learn offline → JSON weights → Node inference | Real metrics with a single-runtime deployment. Logistic regression's linearity is what makes the feature explanation honest. |
| AD-6 | In-process vector store | ~50 vectors. A vector DB adds a container and a failure mode for zero accuracy gain. |
| AD-7 | Local Ollama, two distinct model families | No keys, reproducible anywhere, and two families give the bandit a real distinction while removing common-mode failure. |
| AD-8 | Abstention returns 200 | "I don't know" is a correct answer and must flow through the same reward path, or the policy cannot learn from it. |
| AD-9 | Postgres for durable state | Learned state must survive restarts for "it improved over the session" to be demonstrable. Postgres over SQLite because the scaling path in §22 of the design (multiple API replicas needing atomic arm increments) is the one this system reaches first, and jsonb gives the rationale object a typed home instead of a TEXT column. |
| AD-11 | Two Postgres schemas, `platform` and `copilot` | Reference data is re-seeded from the repo on every boot; learned state must never be rebuilt. Encoding that in the namespace makes "safe to truncate" checkable rather than remembered. |
| AD-12 | REST **and** tRPC over one service layer | REST is the pinned contract and must work with curl; tRPC is the platform's house transport and gives typed clients. Both call the same functions, so there is no second implementation to drift. |
| AD-10 | Provisional + terminal two-phase update | Latency and grounding signals exist at answer time; waiting for a click that may never come would discard them. |
