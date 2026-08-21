# MediaOps Copilot

A support agent for a media-generation / render-orchestration platform. It decides
whether a question needs semantic retrieval or an exact lookup, refuses to answer
anything it cannot cite, and learns which retrieval path and which model to use from
real operator feedback.

---

# Commands

Everything needed to run, test, and operate the system. Start here.

## 0. Prerequisites

| Needed | Version | Notes |
|---|---|---|
| Node.js | >= 20.11 | 22.x is what CI and the images use |
| npm | >= 10 | ships with Node 20/22 |
| Docker + Compose v2 | >= 24 | `docker compose version` |
| Postgres | 16 | only if running it natively instead of via compose |
| Python | >= 3.10 | **optional** - only for the reference ML trainer |

Full list, including model weights and ports: [`requirements.txt`](./requirements.txt).

## 1. Fastest path - Docker (everything included)

```bash
git clone <repo-url> && cd MediaOps_Copilot

# Optional but recommended: hosted generation, ~270 MB of local downloads
# instead of ~4.2 GB. Get a key at https://openrouter.ai/keys
echo "OPENROUTER_API_KEY=sk-or-..." > .env

# Pull the embedding model BEFORE the API starts. The vector index is built
# once at boot, so a model pulled afterwards leaves the vector path disabled
# until the API restarts.
docker compose up -d ollama
docker compose exec ollama ollama pull nomic-embed-text

# Only for LLM_PROVIDER=ollama, or as a hosted-outage fallback (~3.9 GB)
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull qwen2.5:3b

# Now everything else
docker compose up --build
```

- **Console** -> http://localhost:3000 (set `WEB_PORT=3001` if 3000 is taken)
- **API** -> http://localhost:8080

Migrations run automatically from the API container's entrypoint, retrying while
Postgres comes up.

**On Windows PowerShell**, use this instead of `echo ... > .env`. PowerShell's `>` is
`Out-File`, which encodes text rather than writing raw bytes — Windows PowerShell 5.1
defaults it to UTF-16 LE. Compose then fails outright with
`unexpected character in variable name`, and other shells may leave a UTF-8 BOM that
makes the key silently never apply:

```powershell
[IO.File]::WriteAllText("$PWD\.env", "OPENROUTER_API_KEY=sk-or-...`n")
```

Verify before starting anything — the first bytes must be `4F 50 45 4E` (`OPEN`), not
`FF FE` or `EF BB BF`:

```powershell
Format-Hex .env | Select-Object -First 1
```

**Already started it in the wrong order?** Pull the model, then restart so the API
re-indexes. Environment changes need a recreate, not a restart:

```bash
docker compose exec ollama ollama pull nomic-embed-text
docker compose up -d --force-recreate api
```

Check it worked — `vector_index` should report chunks indexed, not `0`:

```bash
curl http://localhost:8080/health
```

## 2. Local development

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

docker compose up -d postgres      # or point .env at any Postgres
npm run migrate

npm run dev:api                    # http://localhost:8080
npm run dev:web                    # http://localhost:3000
```

## 3. Tests

```bash
docker compose up -d postgres
createdb -h localhost -U copilot mediaops_test    # or set TEST_DB_DATABASE

npm test                                  # everything - 167 tests
npm run test --workspace=apps/api         # 149 tests
npm run test --workspace=apps/web         #  18 tests
npm run test --workspace=apps/api -- test/bandit.test.ts    # one suite
```

## 4. Quality gates (what CI runs)

```bash
npm run lint         # eslint + next lint, both workspaces
npm run typecheck    # tsc --noEmit, both workspaces
npm test             # all suites
npm run build        # compile both apps
```

## 5. Machine learning

```bash
npm run ml:dataset        # regenerate ml/synthetic_dataset.csv from features.ts
npm run ml:train          # pure-Node trainer - no Python needed
npm run ml:train:python   # scikit-learn reference trainer (CI runs this)

pip install -r requirements.txt    # only for the Python trainer
```

## 6. Database

```bash
npm run migrate                    # apply migrations
npm run migrate:rollback           # undo the last batch
npm run migrate:make <name>        # new migration file
```

## 7. OpenTelemetry (optional)

```bash
docker compose --profile telemetry up otel-collector   # OTLP :4318, health :13133
OTEL_ENABLED=true npm run dev:api
```

Off by default. Prometheus at `/metrics` works with no collector at all.

## 8. Try it

| Query | What it proves |
|---|---|
| `what does error code RENDER_TIMEOUT mean` | Vectorless wins - exact glossary hit in ~2 ms with a primary-key citation |
| `why is my render slower than usual` | Vector wins - cosine finds the performance runbook; vectorless correctly abstains |
| `why did job 482 fail` | Pins to the record, then follows the failure reason into the glossary |
| `zxqv plorbnat wibble frotz` | Abstains - nothing clears the retrieval floor, so no model is invoked at all |

```bash
curl -X POST http://localhost:8080/query \
  -H 'content-type: application/json' \
  -d '{"query":"what does error code RENDER_TIMEOUT mean"}'

curl -X POST http://localhost:8080/feedback \
  -H 'content-type: application/json' \
  -d '{"transaction_id":"<id-from-above>","score":1}'

curl http://localhost:8080/health
curl http://localhost:8080/metrics
```

Then click **Helpful / Unhelpful** in the console and watch the RL panel move.

## 9. Full script reference

| Command | Does |
|---|---|
| `npm run dev` | Both apps together |
| `npm run dev:api` / `dev:web` | One app |
| `npm run build` | Compile both |
| `npm run lint` / `typecheck` / `format` | Quality gates |
| `npm test` | All suites |
| `npm run migrate` / `migrate:rollback` / `migrate:make` | Schema |
| `npm run ml:dataset` / `ml:train` / `ml:train:python` | Classifier |
| `docker compose up --build` | Whole system |
| `docker compose --profile telemetry up otel-collector` | OTLP collector |
| `docker compose exec ollama ollama pull <model>` | Model weights |

---

# The design

## The core thesis

Support engineers ask two structurally different kinds of question:

| Question shape | Example | Correct machinery |
|---|---|---|
| **Exact / structured** — the answer is a *field* | `what does error code RENDER_TIMEOUT mean` | Deterministic lookup. Embeddings add latency and a chance of returning a *similar* row instead of the *right* one. |
| **Fuzzy / open-ended** — the answer is *explained* across prose | `why is my render slower than usual` | Semantic retrieval over runbook chunks. |

Treating both as "RAG" is wrong twice. So routing comes first, and only the genuinely
uncertain part of that decision is handed to a learner.

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

## The request path

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

## Model runtime: local, hosted, or both

`LLM_PROVIDER` picks the runtime and nothing else changes: every caller is written
against the `LlmAdapter` interface, so the ReAct loop, grounding gate, bandit and routes
are identical whichever branch runs.

| `LLM_PROVIDER` | Generation | Embeddings | Local download | Needs a key |
|---|---|---|---|---|
| `hybrid` *(default)* | OpenRouter, falling back to Ollama | Ollama | ~270 MB | Yes |
| `openrouter` | OpenRouter only | Ollama | ~270 MB | Yes |
| `ollama` | Ollama | Ollama | ~4.2 GB | No |

OpenRouter serves no embedding endpoint, and the sizes are lopsided — `llama3.2:3b`
≈ 2.0 GB and `qwen2.5:3b` ≈ 1.9 GB against `nomic-embed-text` ≈ 0.27 GB. Hosting
generation skips 93% of the download; hosting embeddings would mean adding a second
provider and putting the vector path on the network for the sake of 270 MB.

**Arm keys are logical, never provider slugs.** The bandit stores arms as
`vectorless|llama3.2:3b` in Postgres. Model IDs map to provider slugs at the edge, so
switching provider — or a slug being retired — does not orphan learned statistics. A
wrong slug shows up as a **masked arm** named in `/health`, not a runtime error.

## Routing

**Stage 1 — deterministic.** A token that resolves to a real primary key (a job ID in
`jobs`, an error code in `error_codes`) pins the path to vectorless. Not a heuristic
guess; an exact match against real data, which cosine similarity cannot beat.

Anchors are checked **before** index health. When both apply, the exact match is the
honest explanation — the query would have taken that path regardless of index health.

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
instead.

## Reinforcement learning

|  |  |
|---|---|
| **State** | Triage class — `simple_lookup` \| `complex_diagnostic` \| `urgent_incident` |
| **Action** | `(path, model)` ∈ `{vector, vectorless} × {llama3.2, qwen2.5}` — 4 arms, **masked to 2** when a rule pins the path |
| **Policy** | ε-greedy, ε = 0.2 decaying to 0.05 as pulls accumulate |
| **Reward** | `R = (feedback × 10) − latency_seconds − hallucination_penalty`, feedback ∈ {0, 1} |
| **Update** | Incremental sample mean, `Q ← Q + (R − Q)/N`, **N = rated pulls** |

The `10×` weight makes helpfulness dominate and latency the tie-breaker between paths of
equal quality. Rewards are **legitimately negative** and nothing clamps at zero: an
unhelpful answer scores `0 × 10 − latency − penalty`, so a slow ungrounded one lands
near −8 and pulls the arm well below the optimistic prior of 5.

**Pulls vs rated pulls.** `pulls` counts every query an arm served and drives epsilon
decay; `rated_pulls` counts the ones a rating actually arrived for and is the `N` the
sample mean divides by. Dividing by `pulls` lets the unrated majority dilute each real
observation — an arm pulled twenty times and rated once would move by `(R − Q)/20` and
stay pinned near the optimistic prior, which keeps it looking best and keeps it being
chosen.

**Two-phase update.** Feedback is asynchronous and may never arrive:

- **Provisional** (end of `/query`) — latency and the grounding verdict are recorded, and
  the pull count increments so exploration accounting stays honest.
- **Terminal** (`POST /feedback`) — the full reward folds into `Q(s,a)`; a second click
  is a 409 and touches nothing.

Silence is read as neither approval nor disapproval.

**Cold start** uses optimistic initialisation (`Q₀ = 5.0`), so every arm is tried before
any is abandoned. The first *rated* pull replaces the prior outright.

**Write atomicity.** A rating and the policy update it causes commit together, as do a
pull and the transaction record it belongs to. `update()` takes a row lock, so two
simultaneous ratings for the same arm serialise instead of one silently overwriting the
other.

## Hallucination control

Four independent gates, three of which run **before** the model can speak.

1. **Retrieval floor** — below the similarity/BM25 threshold, no evidence is returned and
   no LLM call is made at all.
2. **Constrained prompt** — evidence-only instruction; retrieved text is delimited as
   *data*, never as instruction.
3. **Citation validation** — every cited ID must exist in the evidence set. String match,
   not model judgement. Catches fabricated sources **with certainty**.
4. **Lexical overlap** — token overlap between the answer and the *cited* evidence only.

| Overlap | Band | Behaviour |
|---|---|---|
| ≥ 0.45 | High | Answer shown |
| 0.25 – 0.45 | Medium | Answer shown with a caution marker |
| < 0.25 | Low | **Abstain** |

**Why overlap rather than an LLM self-check as the primary gate.** A self-check asks the
same class of system that produced the error to detect it, costs a second generation, and
is unfalsifiable. Overlap is cheap, deterministic, unit-testable, and fails safe.

**Abstention is a first-class outcome.** "I don't know" returns **HTTP 200** with
`grounded: false`, flows through the same rating and reward path, and still costs the arm
its penalty — so the policy learns to prefer paths that produce *verifiable* answers.

## Triage classifier

Multinomial logistic regression over 8 interpretable features. Linearity is what makes
the feature-level explanation honest rather than a story.

Both trainers read the **same numeric feature columns** and emit the **same `model.json`
schema**. The dataset is generated by running the production feature extractor, so
training/serving skew is structurally impossible — and `infer.ts` asserts the loaded
model matches the compiled feature contract at boot.

Held-out results in [`ml/metrics_report.md`](./ml/metrics_report.md), produced by the
scikit-learn reference trainer: accuracy **0.987**, macro F1 **0.989**. That number
deserves its caveat: the data is templated, so the
classifier is learning the generator's vocabulary, not real operator language. The
confusion matrix is the informative part.

## Explainability

Every response carries a `rationale` built from decisions already recorded — no post-hoc
reconstruction, no second model call:

```jsonc
{
  "path":  { "chosen": "vectorless", "why": "Exact match on job ID 482 in the jobs table…", "deterministic": true },
  "model": { "chosen": "qwen2.5:3b", "why": "Exploit: highest mean reward (7.4 over 12 pulls).", "exploring": false },
  "confidence": { "band": "High", "why": "All 2 citations resolve; 0.62 lexical overlap." },
  "triage": { "class": "complex_diagnostic", "why": "Flagged by: contains 'why' (+1.8)…" },
  "evidence": [ { "id": "error_codes:RENDER_TIMEOUT", "excerpt": "Raised when a worker exceeds…" } ]
}
```

**The principle:** explain every decision that would change what the operator *does* with
the answer; keep internal everything that would only change what an engineer does with
the *system*. Cosine values, ε schedules, and the full coefficient matrix stay out.

## API

| Route | tRPC equivalent | Purpose |
|---|---|---|
| `POST /query` | `query.ask` | Ask. Returns answer, path, model, latency, grounding, citations, rationale |
| `POST /feedback` | `feedback.rate` | Rate. Returns recomputed arm statistics |
| `GET /transactions?limit=n` | `transaction.list` | Console feed |
| `GET /rl/stats` | `rl.stats` | Per-arm pulls, mean reward, reward time series |
| `GET /health` | `health.check` | Real dependency probes |
| `GET /metrics` | — | Prometheus text exposition |

Both surfaces call the same service functions — no second implementation to drift.

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

`400` invalid body · `413` body over 64 KB · `503` no path and no model available.
A grounded abstention is `200`, because "I don't know" is a correct answer.
</details>

<details>
<summary><code>POST /feedback</code></summary>

```jsonc
// score is binary: 1 = helpful, 0 = unhelpful
{ "transaction_id": "b1f0…", "score": 1 }   // → { "reward": 8.06, "arm": "vectorless|llama3.2:3b", "arm_mean_reward": 7.4, "arm_pulls": 13 }
{ "transaction_id": "b1f0…", "score": 0 }   // → { "reward": -0.94, … }
```

`404` unknown transaction · `409` already rated (idempotent, policy untouched).

`−1` is accepted and normalised to `0`: silently 400-ing a rating an operator believed
they gave is worse than accepting a legacy value.
</details>

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
grounding.* rl.* dep.* boot.*`), so alerts key on stable fields rather than message
regexes. Startup, shutdown and startup-failure are three distinct events
(`boot.listening`, `boot.shutdown`, `boot.failed`) so a crash loop is alertable without
regexing the message.

**Metrics.** `copilot_requests_total`, `copilot_request_duration_seconds`,
`copilot_retrieval_hits`, `copilot_grounding_failures_total`, `copilot_rl_reward`,
`copilot_rl_pulls_total`, `copilot_dependency_up`.

**Health.** Probes Postgres (`select 1`), the vector index, and both model tags.
Postgres down is **fatal** → `503`. Everything else is **degraded** → `200`, so a load
balancer sheds only genuinely dead instances.

**OpenTelemetry** — wired but off by default, because traces are worth nothing without a
collector. All three signals export over OTLP/HTTP:

- **Traces** — auto-instrumented `pg`, `knex`, `http` spans plus one span per pipeline
  stage (`copilot.triage`, `copilot.retrieve`, `copilot.reason`), attributed with triage
  class, chosen path, model arm, overlap and confidence band.
- **Metrics** — `http.server.request.duration`, `http.server.requests`.
- **Logs** — bridged to the Logs API in `otel/logBridge.ts` rather than by
  `@opentelemetry/instrumentation-pino`. That instrumentation hooks CJS `require` and
  pino is imported directly from ESM, so it never patches — measured, not assumed: with
  the instrumentation alone, zero log records exported and no `trace_id` was injected,
  while `pg` and `knex` (required transitively as CJS) instrumented normally.

Prometheus is untouched — `/metrics` is scrapeable with no collector in the picture.

### If this broke at 3am

1. **`GET /health`** — which dependency flipped? Ollama down is the common case.
2. **Grep the `transaction_id`** — one ID replays triage → route → retrieve → verify.
3. **`copilot_grounding_failures_total`** rising → abstentions, not crashes.
4. **`copilot_rl_reward`** per arm → is one arm dragging the policy down?
5. **`FORCE_VECTORLESS=true`** — the escape hatch. Pins the deterministic path.

## Failure modes

The contract: **degrade to a narrower but still-grounded answer, or abstain — never
crash, never guess.**

| Failure | Behaviour | Operator sees |
|---|---|---|
| Hosted provider unreachable | Generation retries on local Ollama | Answer served; `/health` notes the degradation |
| Both runtimes unreachable | Vectorless returns the raw record as a templated answer | `degraded: true`, rationale explains why |
| One model tag missing | Action space masked; the arm is **not** penalised | The surviving arm |
| Embedding model down | Vector path disabled, all queries forced vectorless | Amber pill; open-ended queries may abstain |
| Retrieval below floor | Abstain + escalation hint, penalty applied | Amber "I don't know" row |
| Phantom citation | Answer replaced by abstention | Explanation naming the invalid citation |
| Agent budget exhausted | Abstain rather than force an answer | Rationale states the budget |
| Postgres unavailable | `503` — nothing can be recorded or learned | Red pill |
| Duplicate feedback | `409`, policy untouched | Button disabled after first click |
| Body over 64 KB | `413` before the body is read into memory | — |
| Unhandled rejection | Logged as `boot.failed` in JSON, then exit | Structured line, not a bare stack |

**The load-bearing invariant:** degradation always moves *toward* determinism —
vector → vectorless → structured template → abstention. Every rung down that ladder is
more verifiable than the one above it.

---

# Tests

**167 tests.** No Ollama required — a deterministic fake adapter and a hand-authored
concept-space embedder make agent and retrieval tests fast and non-flaky.

**Postgres is required for the integration suites.** The bandit's correctness depends on
`on conflict`, `returning`, and atomic increments; the store depends on jsonb
round-tripping. A fake would agree with whatever the code does and prove none of it — so
those suites run against a real database, each taking its own scratch schema pair and
dropping it afterwards. Without a database they **skip with a printed reason** rather
than failing, and CI asserts that they did *not* skip: a green run that tested nothing is
worse than a red one.

| Suite | Tests | Covers |
|---|---|---|
| `api` | 34 | Route contracts; 400/404/409/413; the rationale shape the console destructures; jsonb round-trip fidelity; **model down → 200 + `degraded`**; empty index → forced vectorless; reward series ordering; the tRPC surface |
| `bandit` | 25 | Reward arithmetic incl. negatives; incremental-mean correctness; **rated-pull vs pull division**; ε=0 exploits, ε=1 explores; optimistic init sweeps every arm; masking survives ε=1; per-state independence; persistence across restarts |
| `retrieval` | 25 | Both canonical examples; both BM25 floors; anchor resolution; hard-rule ordering |
| `grounding` | 20 | Phantom citation → abstain; High/Medium banding; overlap cannot be inflated by repetition |
| `agent` | 18 | ReAct parsing; multi-line answers; tool whitelist; step budget; prompt-injection containment |
| `classifier` | 13 | Feature contract; per-class prediction; signed attributions |
| `llm` | 8 | Adapter seam; hybrid fallback; circuit breaker |
| `otel` | 6 | Pino→OTel severity mapping; envelope stripping; non-JSON lines swallowed |
| `web` | 18 | Optimistic feedback + rollback; rationale panel; abstention styling |

## What the newest tests pin

These cover defects found by auditing for edge cases and scale, each written to fail
against the code as it was:

| Test | Defect it guards |
|---|---|
| `divides by rated samples, so unrated pulls cannot dilute a real observation` | 20 unrated pulls + 1 rating of 8 must land on **8.0**, not 5.15. Dividing by `pulls` pinned heavily-served arms near the optimistic prior and kept them looking best. |
| `averages across rated samples regardless of how many pulls went unrated` | The running mean must average the ratings that arrived, not the pulls that did not. |
| `keeps the reward series moving once there are more ratings than the limit` | `getRewardSeries` ordered **ascending** before the limit, returning the *oldest* N — the console chart froze permanently past 200 ratings. |
| `refuses a body larger than any legitimate query before reading it` | A 200 KB POST was buffered fully before zod rejected it. Now `413`. |
| `maps every pino level onto the matching OTel severity` | Severity translation across all six levels, plus INFO fallback for unknown ones. |
| `swallows a line that is not pino JSON rather than failing the write` | A malformed line must not break the log stream. |

## What CI runs

`.github/workflows/ci.yml` — five jobs, failing the build on any lint or test failure:

| Job | Does |
|---|---|
| `lint` | eslint + `tsc --noEmit`, both workspaces |
| `test` | Both suites against a real Postgres 16 service, with `REQUIRE_POSTGRES=true` so a skipped suite is a red build |
| `ml` | `pip install -r requirements.txt`, regenerate the dataset, retrain with scikit-learn, **fail if the committed CSV is stale**, re-run the classifier suite against the retrained model |
| `build` | Build both Docker images, then smoke-test the API image against real Postgres: `/health` must not be `down`, migrations must have applied, and an error-code query must take the `vectorless` path |
| `deploy` | Mock deploy, gated on `main` and on the tests passing |

---

# Configuration

Every knob has a safe default; the service starts with no environment at all beyond the
database. Full annotated list: [`apps/api/.env.example`](./apps/api/.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | API port |
| `PROJECT_ENV` | `development` | `production` widens the connection pool to 50 |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | Postgres location |
| `DB_USER` / `DB_PASSWORD` | `copilot` / `copilot` | Postgres credentials |
| `DB_DATABASE` | `mediaops` | Database name |
| `DB_SSL` | `false` | `true` for managed Postgres with its own CA |
| `TEST_DB_DATABASE` | `mediaops_test` | Database the integration suites use |
| `LLM_PROVIDER` | `hybrid` | `hybrid` \| `openrouter` \| `ollama` |
| `OPENROUTER_API_KEY` | unset | Required by `hybrid` and `openrouter` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Model runtime |
| `FORCE_VECTORLESS` | `false` | 3am override — pin the deterministic path |
| `VECTOR_SIMILARITY_FLOOR` | `0.45` | Below this, no evidence |
| `BM25_SCORE_FLOOR` | `1.2` | Keyword score floor |
| `BM25_COVERAGE_FLOOR` | `0.5` | Share of query terms a hit must cover |
| `RL_EPSILON_START` / `_FLOOR` | `0.2` / `0.05` | Exploration schedule |
| `RL_HALLUCINATION_PENALTY` | `5.0` | Charged at answer time |
| `GROUNDING_HIGH_BAND` | `0.45` | High-confidence overlap threshold |
| `OTEL_ENABLED` | `false` | Turn on OTLP export |
| `OTEL_ENDPOINT` | `http://localhost:4318` | Collector address |
| `LOG_LEVEL` | `info` | pino level |
| `WEB_PORT` | `3000` | Host port for the console |

---

# Security & safety

- **Prompt injection** — retrieved text is delimited as data; the tool schema is a closed
  whitelist, so injected text cannot invent a tool or an argument shape. Covered by test.
- **Destructive actions** — `restart_render` is a non-destructive mock that records intent
  and mutates nothing. A real deployment needs a human-confirmation step first.
- **Model output as untrusted input** — answers render as text, never HTML; citation IDs
  are validated against a known set before use.
- **Input validation** — zod at every boundary; parameterised SQL only; job IDs and error
  codes matched against known keys, never interpolated. Bodies capped at 64 KB.
- **PII** — queries are stored verbatim for the RL loop and could contain incident
  details. Production would need a retention policy and access control on
  `/transactions`.
- **Auth** — out of scope for a single-operator console. The insertion point is Hono
  middleware in front of all routes, with `/health` and `/metrics` on a separate internal
  listener.

---

# Known limits

Stated plainly, because a system that claims to never guess should not guess about itself.

- **Classifier accuracy is not evidence about production.** Templated data, learned
  vocabulary. The confusion matrix is the informative part.
- **RL convergence needs tens of ratings per state.** A short demo shows the mechanism
  working, not a converged policy.
- **Lexical overlap penalises legitimate paraphrase.** It fails safe — a good answer can
  land in Medium — but it is a proxy for entailment, not entailment. NLI is the upgrade.
- **The demo is deliberately non-deterministic.** Roughly one draw in five the bandit
  explores onto the vectorless path and abstains. That is the design working, not a flake.
- **In-memory indexes are per-replica.** Two API replicas embed independently at boot.
  Fine at ~50 chunks; horizontal scale wants a shared store.
- **No retention on `transaction` / `citation`.** Both grow unbounded.
- **The test embedder is a hand-authored concept space**, not a learned one. It exists so
  CI can exercise the vector path deterministically without a model runtime.

---

# Repo layout

```
apps/
  api/                          Hono + tRPC + knex/Postgres, TypeScript
    migrations/                 schemas · platform tables · copilot tables · rated pulls
    src/
      index.ts                  Hono app, appRouter, REST mounts, boot, fatal handlers
      trpc.ts                   router · publicProcedure · operatorProcedure
      context.ts                composition root (llm · retrievers · bandit · grounder)
      config.ts
      connections/              db · ollama · openrouter · hybrid · llmFactory · llmFake
      otel/                     sdk · bootstrap · middleware · metrics · spans · logBridge
      utils/                    logger · metrics · stopwords · circuitBreaker
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
    test/                       api · bandit · retrieval · grounding · agent ·
                                classifier · llm · otel · helpers/db
  web/                          Next.js App Router console
    components/                 QueryBox · TransactionTable · TransactionRow ·
                                RationalePanel · FeedbackButtons · RLPanel · StatusPill
ml/                             train_triage_classifier.py · train_fallback.mjs ·
                                synthetic_dataset.csv · metrics_report.md
requirements.txt                every prerequisite, pip-installable
otel-collector.yaml             OTLP collector config (compose profile: telemetry)
.github/workflows/ci.yml        lint → test → ml → docker build → gated deploy
docker-compose.yml              postgres + ollama + api + web (+ collector)
```

---

# Key design decisions

| # | Decision | Why |
|---|---|---|
| AD-1 | Deterministic rules first, bandit for the residual | An exact key match is *knowledge*, not a hypothesis. Spending exploration budget on it would be strictly worse. |
| AD-2 | Joint action `(path, model)`, path-masked when pinned | The two interact — a terse model suits exact lookups, a verbose one suits multi-chunk synthesis. Masking keeps the deterministic guarantee intact under exploration. |
| AD-3 | Tabular ε-greedy over LinUCB | 3×4 converges in tens of samples, which is what a demo can actually produce. LinUCB is the upgrade path, not the starting point. |
| AD-4 | Overlap + citation validation as the primary gate | Deterministic, unit-testable, no extra generation, fails safe. Citation validation catches fabricated sources with certainty. |
| AD-5 | scikit-learn offline → JSON weights → Node inference | Real metrics with a single-runtime deployment. Logistic regression's linearity is what makes the feature explanation honest. |
| AD-6 | In-process vector store | ~50 vectors. A vector DB adds a container and a failure mode for zero accuracy gain. |
| AD-7 | Two distinct model families, local or hosted | Two families give the bandit a real distinction while removing common-mode failure. |
| AD-8 | Abstention returns 200 | "I don't know" is a correct answer and must flow through the same reward path, or the policy cannot learn from it. |
| AD-9 | Postgres for durable state | Learned state must survive restarts for "it improved over the session" to be demonstrable. jsonb gives the rationale object a typed home instead of a TEXT column. |
| AD-10 | Provisional + terminal two-phase update | Latency and grounding signals exist at answer time; waiting for a click that may never come would discard them. |
| AD-11 | Two Postgres schemas, `platform` and `copilot` | Reference data is re-seeded from the repo on every boot; learned state must never be rebuilt. Encoding that in the namespace makes "safe to truncate" checkable rather than remembered. |
| AD-12 | REST **and** tRPC over one service layer | REST is the pinned contract and must work with curl; tRPC gives typed clients. Both call the same functions, so there is no second implementation to drift. |
| AD-13 | `rated_pulls` separate from `pulls` | The sample-mean update assumes N is the number of observations. Counting served queries instead let silence dilute real ratings. |
| AD-14 | OpenTelemetry off by default, Prometheus always on | Traces need a collector to be worth anything; `/metrics` needs nothing, which is what keeps the service demonstrable on a laptop. |
