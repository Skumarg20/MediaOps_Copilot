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
| Neo4j | 5 + Graph Data Science | the graph store; ships in compose as `neo4j` |
| Python | >= 3.10 | **optional** - only for the reference ML trainer |

Full list, including model weights and ports: [`requirements.txt`](./requirements.txt).

## 1. Fastest path - Docker (everything included)

```bash
git clone <repo-url> && cd MediaOps_Copilot

# Optional but recommended: hosted generation, ~270 MB of local downloads
# instead of ~4.2 GB. Get a key at https://openrouter.ai/keys
# On Windows PowerShell, `>` writes UTF-16 and Compose rejects it - see below.
echo "OPENROUTER_API_KEY=sk-or-..." > .env

# Pull the embedding model. Doing this before the API starts is the fast path;
# a model pulled later is picked up on its own within a few minutes.
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
- **Neo4j browser** -> http://localhost:7474 (`neo4j` / `copilotgraph`)

Migrations run automatically from the API container's entrypoint, retrying while
Postgres comes up. Load the graph once the stack is up:

```bash
npm run graph:sync --workspace=apps/api
```

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

**Already started it in the wrong order?** Just pull the model:

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

The API builds the corpus index at boot, but a failed build is retried in the
background on a widening interval (15s, 30s, 60s, 120s, 240s), so a model that lands
during that window is picked up without a restart. Past it, force a recreate -
environment changes need a recreate rather than a restart:

```bash
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

docker compose up -d postgres neo4j   # or point .env at your own
npm run migrate
npm run graph:sync --workspace=apps/api   # load the 7 domains into Neo4j

npm run dev:api                    # http://localhost:8080
npm run dev:web                    # http://localhost:3000
```

## 3. Tests

```bash
docker compose up -d postgres
createdb -h localhost -U copilot mediaops_test    # or set TEST_DB_DATABASE

npm test                                  # everything - 218 tests
npm run test --workspace=apps/api         # 200 tests
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
| `how do I fix job 482` | Fused path - the record, the error code, and the runbook section two hops out, each cited with the route that reached it |
| `which worker is causing the most failures` | Structural pin - an aggregation over every job, which no top-K retriever can compute |
| `which error codes have no runbook coverage` | Set complement - similarity search can only return codes that DO match something |
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
| `npm run eval` | Golden-set evaluation → `ml/eval_report.md` (needs Postgres) |
| `npm run eval:architectures --workspace=apps/api` | Nine retrieval architectures compared → `ml/algorithm_comparison.md`. Needs Neo4j + `graph:sync`; no model runtime, no API keys |
| `npm run graph:sync --workspace=apps/api` | Load every domain into Neo4j |
| `npm run graph:verify --workspace=apps/api` | Check the Cypher/GDS operators against known answers |
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
                                   │
                                   ├─► Postgres                    ── source of truth ──
                                   │     platform.*  jobs · error codes      (reference, re-seeded)
                                   │     copilot.*   transactions · feedback ·
                                   │                 bandit arms · citations (learned, never rebuilt)
                                   │
                                   └─► Neo4j 5 + GDS               ── derived index ──
                                         :Entity nodes, one label per type
                                         typed edges carrying validFrom / validTo
                                         traversal in Cypher, algorithms in GDS
```

One API process hosts every plane, but each is a module behind an interface —
`Retriever`, `Policy`, `Grounder`, `Classifier` — so any one can move out of process
without a rewrite. At ~50 chunks, a vector database would add a container and a failure
mode for zero accuracy gain — the embeddings stay in process.

**Two stores, two jobs.** Postgres holds the records and everything learned. Neo4j holds
the *graph derived from them*, in the same relationship the vector index has to the
corpus: `Neo4jGraph.sync()` reads the rows out of Postgres, pairs them with the chunked
runbooks, and writes nodes and typed edges in. Traversal, degree, complement, temporal
filtering and the three centrality algorithms are then Cypher and GDS rather than code in
this repository.

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

`LLM_PROVIDER` picks the runtime and nothing else changes: callers depend on the
`Generator` and `Embedder` roles, not on a provider, so the ReAct loop, grounding gate,
bandit and routes are identical whichever branch runs.

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

**Stage 1b — structural.** Some questions have an answer that is a property of *how*
records relate rather than a field on any one of them: "which worker fails most", "which
codes have no runbook", "is 482 the same problem as 487", "who supplies this now". No
amount of top-*K* similarity retrieval reaches those, so they pin to the fused path,
which can traverse and compute. This rule runs **before** the anchor rules on purpose —
"which jobs failed for the same reason as 482" resolves an anchor, but the anchor is the
question's starting point, not its answer.

**Stage 2 — learned.** For everything else the path is genuinely uncertain, so it joins
the bandit's action space alongside the model choice.

| Signal | Path | Why |
|---|---|---|
| Aggregation / absence / degree / comparison / temporal / what-if shape | **Hybrid (pinned)** | Structurally unreachable by similarity — needs traversal or computation |
| Anchor resolves **and** the question asks what to *do* | **Hybrid (pinned)** | The record carries the failure reason; the runbook carries the judgement. Cite both |
| Query contains an existing job ID | Vectorless (pinned) | Exact record retrieval |
| Query contains a known error code | Vectorless (pinned) | A glossary hit is definitionally correct |
| Short keyword/entity lookup | Vectorless (bandit-preferred) | BM25 over structured records is fast and precise |
| Open-ended "why / how / should I" | Vector (bandit-preferred) | Answer is distributed across prose |
| Vector store unavailable | **Hybrid (forced)** | Lexical search and graph traversal still cover the whole corpus without embeddings |

---

## Search paths — system design

Four search mechanisms. Three are **retrieval** paths the router picks between per query;
the fourth is **computation** the agent invokes on top of whichever path ran.

| | Answers | Indexes | Signal | Runtime cost | Code |
|---|---|---|---|---|---|
| `vectorless` | "what is this record / what does this code mean" | 20 records | exact key, then BM25 | no model call | `retrieval/services/vectorless.ts` |
| `vector` | "explain / why / how should I" | ~34 prose chunks | cosine over embeddings | one embed call — **hard dependency** | `retrieval/services/vector.ts` |
| `hybrid` | "how do I fix X" and anything structural | all 68 nodes: records, chunks and entities | all three, rank-fused, then traversed | one embed call, skipped if unavailable | `retrieval/services/hybrid.ts` |
| operators | "how many / which have none / rank by / what if" | the graph itself | Cypher + Neo4j GDS | no model call | `graph/services/operators.ts` |

The first three implement one interface:

```ts
interface Retriever {
  name: RetrievalPath;
  retrieve(query: string, ctx: QueryContext): Promise<Evidence[]>;
  health(): Promise<DependencyStatus>;
}
```

so the pipeline, the eval harness and the bandit never learn which one they are holding.

---

### The shared substrate: the knowledge graph

Everything except `vector` reads the same object: a **typed, timestamped, directed
multigraph** built from rows that already exist — no LLM extraction, because the entities
are already typed and extraction would only add noise.

It is stored in **Neo4j**, run from a Docker image alongside Postgres:

```bash
docker compose up -d neo4j                        # bolt :7687, browser :7474
npm run graph:sync   --workspace=apps/api         # load every domain
npm run graph:verify --workspace=apps/api         # 15 checks against known answers
```

Traversal and the graph algorithms are **Cypher and the Graph Data Science library**, not
hand-written code:

| Operator | Implementation |
|---|---|
| `shortest_path` | Cypher `shortestPath()` with edge-type and validity filters |
| `subgraph`, `get_neighbors` | variable-length `-[*1..N]-` patterns |
| `count_edges`, `aggregate_over_type` | `count` / `collect` with `ORDER BY` |
| `set_complement` | `WHERE NOT n.id IN $exclude` |
| `filter_edges_by_date`, `asOf` | `WHERE r.validFrom <= $asOf AND r.validTo > $asOf` |
| `simulate_removal` | subquery counting surviving links of the same type |
| `betweenness` | `gds.betweenness.stream` |
| `pagerank` | `gds.pageRank.stream` |
| `connected_components` | `gds.wcc.stream` |

Centrality and component queries project the subgraph **induced by the type asked about**
(`gds.graph.project` over `:Hub`-to-`:Hub` lanes, `:Account`-to-`:Account` counterparties),
so "which hub is the bottleneck" is a question about the lane network rather than about
whatever shipment happens to touch two hubs.

```
                        ┌────────────┐
   Submitter ◄──────────┤            ├──────────► Worker
   SUBMITTED_BY         │    Job     │  RAN_ON
   JobClass  ◄──────────┤            │
   OF_CLASS             └─────┬──────┘
                              │ FAILED_WITH
                              ▼
                        ┌────────────┐  DOCUMENTS  ┌────────────┐
                        │ ErrorCode  │◄────────────┤ DocSection │
                        └────────────┘             └─────┬──────┘
                                                         │ ADJACENT_TO
                                                         ▼
                                                    DocSection
```

Six node types, six edge types, 68 nodes and 108 edges for this repository's own data.
Every edge is timestamped from the job's `queued_at`, so the whole graph is filterable by
date without retrofitting anything.

Three properties the rest of the design leans on:

- **Every node carries its own retrievable text.** A vector hit, a lexical hit and a graph
  node are therefore the same object — no join between two stores and no drift between
  them.
- **Every edge carries validity.** `validFrom` / `validTo` mean an expired relationship
  leaves the *active* graph while its text stays in the corpus. That is what makes "who
  supplies this **now**" answerable and what makes it a trap for text retrieval.
- **The schema is data.** `GraphSchema` declares node types and typed edges, so operators
  can ask "what is adjacent to a Seller" without anything hard-coded per domain.

`DocSection -DOCUMENTS-> ErrorCode` cannot be built from string matching alone: only 3 of
8 codes are named in any runbook. Edges are built from literal mentions **plus** term
overlap between the code's meaning/remediation text and a section, above
`GRAPH_DOC_LINK_FLOOR` (0.34), capped at 2 inferred links per code. The basis is recorded
on the edge (`literal_mention` vs `term_overlap`), so an inferred link is never mistaken
for a stated one.

---

### Path 1 — `vectorless`: exact lookup, then keyword search

**For:** questions whose answer is a *field*. `what does RENDER_TIMEOUT mean`.

#### Index

Job rows and error-code rows are flattened to sentences and indexed into a hand-written
BM25 (`k1 = 1.5`, `b = 0.75`) — 20 documents for this repo's data. Rebuilt at boot; nothing persists.

#### Query

```
query + anchors resolved by the router
   │
   ├─► 1. EXACT ─── job:482 ──► the record
   │                    └─── follows failure_reason ──► errorCode:RENDER_TIMEOUT
   │              errorCode:X ──► the glossary entry
   │                    │
   │                    └── any hit? ──► return immediately, no floor applied
   │
   └─► 2. BM25 (only when no anchor resolved)
              score ≥ 1.2  AND  coverage ≥ 0.5   ──► top 3
              otherwise ──────────────────────────► return nothing → abstain
```

The ordering is the point: **an exact hit is never scored against a floor**, because a
primary-key match has no similarity to be uncertain about. The one-hop follow from job to
error code is the only structure this path has.

#### Why two floors

The score floor alone is not enough. One corpus-wide term (`render`) can drag an
irrelevant record over any threshold — which is how `why is my render slower than usual`
gets answered with a plausible-looking `RENDER_TIMEOUT` definition that does not address
it. Requiring a hit to cover a real share of the query's *content* terms is what makes
this path abstain instead.

#### Fails when

The answer lives in prose. This index has never seen a runbook.

---

### Path 2 — `vector`: dense retrieval over prose

**For:** questions whose answer is *explained* across paragraphs. `why is my render slower
than usual`.

#### Index

Six runbooks → heading-aware chunking at 500 chars with 80 overlap → ~34 chunks → embedded
with `nomic-embed-text` at boot. A failed build is retried on a widening interval
(15s, 30s, 60s, 120s, 240s) so a model pulled late is picked up without a restart.

#### Query

```
query ──► embed ──► cosine against every chunk ──► sort desc
                                                      │
                    admit if:  cos ≥ 0.45                          (hard floor)
                          AND ( cos ≥ 0.70                         (strong match)
                                OR term coverage ≥ 0.40 )          (weak but on-topic)
                                                      │
                                                      └─► top 3
```

The compound floor is doing real work. A bare cosine floor lets a fluent, topically
adjacent chunk through on vocabulary alone; requiring either a *strong* score or genuine
term overlap is what makes `write me a poem about rendering` abstain despite sharing the
corpus's whole vocabulary.

#### Fails when

The embedder is down — the entire prose corpus becomes invisible, because nothing else
indexes it. That gap is exactly what `hybrid` closes.

---

### Path 3 — `hybrid`: fused retrieval with graph expansion

**For:** everything that needs a record *and* prose, and everything structural.

#### Index

**Every graph node** becomes one retrieval unit — job records, error codes, workers, job
classes, submitters and runbook chunks alike. One unit set, indexed twice: BM25 *and*
embeddings. Before this, the two indexes covered disjoint halves of the corpus and could
never reinforce each other.

#### Query — six stages

```
 ┌─ 1. SEED ─────────────────────────────────────────────────────────┐
 │  exact anchors        weight 2   ─┐                               │
 │  BM25    ≥1.2 & cov ≥0.5          ├─ each subject to the SAME     │
 │  dense   ≥0.45 & (≥0.7 | cov≥0.4) ┤  floors the single paths use  │
 │  type-name seeds      weight 0.5 ─┘  (only when no exact anchor)  │
 └───────────────────────────┬───────────────────────────────────────┘
                             │  no seed cleared a floor? ──► abstain
                             ▼
 ┌─ 2. FUSE ─────────────────────────────────────────────────────────┐
 │  Reciprocal Rank Fusion:  score(d) = Σ  weight / (60 + rank(d))   │
 │  rank-only, so BM25 sums and cosines never need calibrating       │
 └───────────────────────────┬───────────────────────────────────────┘
                             ▼
 ┌─ 3. EXPAND ───────────────────────────────────────────────────────┐
 │  BFS ≤2 hops from the top 4 fused seeds, both directions          │
 │  score = seed × hopDecay[hops] × 0.9                              │
 │  hopDecay = [1.0, 1.0, 0.6, 0.35, 0.2]                            │
 │  records hop path + edge types on every node it reaches           │
 └───────────────────────────┬───────────────────────────────────────┘
                             ▼
 ┌─ 4. RANK ─────────────────────────────────────────────────────────┐
 │  score desc, then hops asc — a node matched directly outranks a   │
 │  node merely adjacent to one                                      │
 └───────────────────────────┬───────────────────────────────────────┘
                             ▼
 ┌─ 5. DIVERSIFY ────────────────────────────────────────────────────┐
 │  MMR:  0.7 × relevance − 0.3 × max Jaccard to already-selected    │
 │  term-set similarity, so it still works with the embedder down    │
 └───────────────────────────┬───────────────────────────────────────┘
                             ▼
 ┌─ 6. CAP ──────────────────► top 6, each carrying its provenance ──┘
```

#### Three design decisions worth the words

**Rank fusion, not score fusion.** BM25 scores are unbounded sums of IDF terms; cosine
similarities live in `[-1, 1]`. Adding or weighting them needs a calibration that would
have to be re-fitted every time the corpus changes. RRF uses only ordinal position, so
there is nothing to calibrate. `k = 60` damps the top ranks enough that no single
retriever dominates on its own.

**Expansion runs only from admitted seeds.** This is the load-bearing guardrail. The
floors are *unchanged* from the two single-signal paths, and traversal starts only from
something that already cleared one. Without it, an out-of-domain question with one weak
accidental match expands into a plausible-looking pile of evidence and the abstention
behaviour dies quietly. Every out-of-domain case in the golden set and in all seven
benchmark domains is re-run against this specifically.

**Type-name seeding.** `rank products by exposure to active incidents` names no entity and
shares few terms with any single record, so every similarity floor rejects it — yet it is
a perfectly answerable question about a population the schema knows by name. When no exact
anchor pinned the query, nodes of any type the query names outright are admitted at low
weight. A question has to accidentally contain a schema type name to get through, and no
abstention case does.

#### Evidence shape

Every item carries how it was reached:

```jsonc
{
  "id": "runbook-timeouts-and-retries#c3",
  "source": "hybrid",
  "score": 0.54,
  "meta": {
    "kind": "DocSection",
    "retrievedBy": ["graph"],
    "hops": 2,
    "hopPath": "job:482 -> errorCode:RENDER_TIMEOUT -> runbook-timeouts-and-retries#c3",
    "viaEdges": ["FAILED_WITH", "DOCUMENTS"],
    "fusionRanks": [{ "source": "exact", "rank": 1 }]
  }
}
```

Graph retrieval is explainable by construction — the traversal path *is* the explanation.
Throwing it away at the citation boundary would waste that for nothing, so a reviewer can
audit not just *that* a fact was retrieved but *why*.

#### Degrades, does not fail

With the embedder down the dense list is simply empty. Lexical search and graph traversal
still cover the whole corpus, so `hybrid` reports `degraded` rather than `down` — and the
router pins to it during an embedding outage for exactly that reason.

---

### Layer 4 — operator search: computing over the graph

Not a retriever. Fifteen typed graph operations exposed to the ReAct loop as tools; their
results become citable evidence alongside whatever the retrieval path returned.

| Tier | Operators |
|---|---|
| Traversal (9) | `find_nodes` `get_node` `get_neighbors` `shortest_path` `subgraph` `count_edges` `set_complement` `filter_edges_by_date` `propagate_risk` |
| Computation (6) | `simulate_removal` `subgraph_diff` `aggregate_over_type` `betweenness` `pagerank` `connected_components` |

#### Why a separate layer at all

Retrieval answers *"find me the relevant material."* Some questions are not asking for
material:

| Question shape | Why retrieval cannot answer it | Operator |
|---|---|---|
| "which worker fails most" | a count over every record; top-*K* samples, it does not count | `aggregate_over_type` |
| "which codes have no runbook" | similarity returns what *matches*; absence has nothing to match | `set_complement` |
| "if worker-07 is drained, what stops" | defined by what is missing after a hypothetical edit | `simulate_removal` |
| "is 482 the same problem as 487" | no chunk contains a comparison | `subgraph_diff` |
| "rank everything by blast radius" | a weighted score that exists in no text | `propagate_risk` |
| "which accounts are cut off" | isolation is invisible to similarity by construction | `connected_components` |

#### The distinction that makes it work

Each **computation** operator encapsulates a *complete algorithm*, not a step. A
traversal-only planner has to emulate an aggregate by iterating — one `count_edges` per
member — and runs out of step budget on anything but a tiny population. `aggregate_over_type`
does the whole iteration internally, so the model makes **one** call where the loop would
have needed six and still not finished.

Measured over 83 queries in 7 domains: traversal primitives alone get 62 correct; adding
the six computation operators gets 76. See
[`ALGORITHM_COMPARISON.md`](./ALGORITHM_COMPARISON.md).

#### Calling convention

The system prompt names which operator fits which question shape — *"for aggregation
queries use `aggregate_over_type` INSTEAD of iterating manually"* — because that
instruction is what made adoption work in the reference paper. Calls are parsed from the
Action line in either positional or keyword form:

```
Action: aggregate_over_type(rootType=Worker, targetType=Job, where=status=failed)
Action: set_complement(ErrorCode, [errorCode:RENDER_TIMEOUT, errorCode:UPLOAD_TIMEOUT])
```

An operator result contributes two kinds of evidence: the operator's own observation
(`graph:aggregate_over_type(...)`) and up to six of the **entities it identified**, as
separately citable items — so a structural answer cites the records it is about, not just
the tool that found them. Every call is persisted to `copilot.tool_invocation`.

#### Domain-agnostic by construction

Nothing in the operator layer knows about render jobs. A different dataset is a different
`DomainDataset` and nothing else; six ship in `modules/graph/services/domains/` —
aerospace, retail, manufacturing, logistics, finance and commerce — and all six are
hold-out corpora for the architecture benchmark.

---

### How the four compare

| | `vectorless` | `vector` | `hybrid` | operators |
|---|---|---|---|---|
| Covers records | ✅ | ❌ | ✅ | ✅ |
| Covers prose | ❌ | ✅ | ✅ | ❌ |
| Needs the embedder | ❌ | ✅ **hard** | ⚠️ degrades | ❌ |
| Multi-hop | 1 hop, one way | ❌ | ≤2 hops, both ways | caller-specified |
| Counts / aggregates | ❌ | ❌ | ❌ | ✅ |
| Answers absence | ❌ | ❌ | ❌ | ✅ |
| Temporal filtering | ❌ | ❌ | ⚠️ see below | ✅ |
| Explains its route | primary key | ❌ | hop path | operator + path |
| top-*K* | 3 | 3 | 6 | n/a |

`topK` stays at 3 for the two single-signal paths because raising it there only buys
near-duplicates. `hybrid` can afford 6 because fusion and MMR make the extra slots carry
different content.

**Known gap — temporal filtering on the hybrid path.** The graph carries `validFrom` /
`validTo` on every edge and the operators honour them, but `HybridRetriever` expands
without passing an `asOf`, so its traversal walks expired edges alongside active ones. It
does not currently have a "now" to pass: `QueryContext` carries anchors and triage, not a
reference instant. Temporal questions are therefore answered by the operator layer, which
is why the router pins them to `hybrid` — the path whose *agent* can filter, not whose
*retrieval* does. Threading a reference time through `QueryContext` would close it.

### Which one runs

```
                       ┌── forced by config ──────────────► vectorless
                       │
                       ├── structural shape? ─────────────► hybrid   (pinned)
                       │   aggregation · absence · degree
                       │   comparison · temporal · what-if
                       │
   query ──► router ───┼── anchor + "what should I do"? ──► hybrid   (pinned)
                       │
                       ├── anchor resolves? ──────────────► vectorless (pinned)
                       │
                       ├── embedder down? ────────────────► hybrid   (forced)
                       │
                       └── genuinely uncertain ───────────► ε-greedy bandit
                                                              over 6 arms
                                                              (3 paths × 2 models)
```

If the chosen path returns nothing above its floor, the pipeline falls back **once** — to
`hybrid` if it is not already there, otherwise to `vectorless`. Hybrid is the right
fallback because it is the only path covering both records and prose; falling back from
`vector` to `vectorless` used to swap one half of the corpus for the other.

Operators are not routed. The agent invokes them during the ReAct loop on top of whatever
retrieval returned, and the grounding gate judges the combined result the same way it
judges everything else.

### Tuning surface

Every knob is an environment variable with a documented default; none needs changing to
run the system.

| Variable | Default | Governs |
|---|---|---|
| `RETRIEVAL_TOP_K` | 3 | Cap for `vector` and `vectorless` |
| `HYBRID_TOP_K` | 6 | Cap for `hybrid` |
| `BM25_SCORE_FLOOR` / `BM25_COVERAGE_FLOOR` | 1.2 / 0.5 | Lexical admission |
| `VECTOR_SIMILARITY_FLOOR` | 0.45 | Hard cosine floor |
| `VECTOR_STRONG_SCORE` / `VECTOR_COVERAGE_FLOOR` | 0.7 / 0.4 | The either/or above the hard floor |
| `RRF_K` | 60 | Rank-fusion damping |
| `MMR_LAMBDA` | 0.7 | Relevance vs diversity |
| `GRAPH_MAX_HOPS` | 2 | Expansion radius |
| `GRAPH_EXPANSION_SEEDS` | 4 | How many seeds may expand |
| `GRAPH_EXPANSION_DISCOUNT` | 0.9 | Penalty on anything reached by traversal |
| `GRAPH_DOC_LINK_FLOOR` | 0.34 | Term overlap for an inferred documentation edge |
| `AGENT_MAX_STEPS` | 5 | ReAct budget |
| `NEO4J_URL` | `bolt://localhost:7687` | Graph store |
| `NEO4J_USER` / `NEO4J_PASSWORD` | `neo4j` / `copilotgraph` | Matches the compose service |
| `NEO4J_DATABASE` | `neo4j` | Database name |
| `NEO4J_POOL_SIZE` / `NEO4J_TIMEOUT_MS` | 20 / 15000 | Driver pool and acquisition timeout |


## Reinforcement learning

|  |  |
|---|---|
| **State** | Triage class — `simple_lookup` \| `complex_diagnostic` \| `urgent_incident` |
| **Action** | `(path, model)` ∈ `{vector, vectorless, hybrid} × {llama3.2, qwen2.5}` — 6 arms, **masked to 2** when a rule pins the path |
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

**Cold start** uses optimistic initialisation (`Q₀ = 10.0`), so every arm is tried before
any is abandoned. The first *rated* pull replaces the prior outright.

`Q₀` must be **at least the maximum achievable reward**, which is what `feedback × 10`
makes it. It was 5.0 until a live run proved why that is wrong: one Helpful rating scored
9.94, and because every unexplored arm sat at 5.0, that single observation outranked all
of them permanently. The arm took 64 of the next 66 pulls in its state while its
alternatives stayed on 2 — and by then ε had decayed to its floor, so exploration could
not undo it. A prior below the reward ceiling is not optimism; it is a head start for
whichever arm happens to be rated first.

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

## Evaluation

Everything above is a claim. Two harnesses check it.

### `npm run eval` — does the routing and the gate earn their keep?

A 50-case golden set labelled from the fixtures — 36 answerable, 14 that must be refused,
including ten structural cases and two structural-shaped out-of-domain traps.

Each strategy runs the **real** routing, retrieval, agent and grounding code; only the
path-selection policy and the gate are swapped. The model is a deterministic fake, so runs
are reproducible and the measurement is of the machinery around the model rather than of a
particular model's fluency.

| Strategy | Routing acc. | False answers | Abstention F1 |
|---|---|---|---|
| **Routed (this system)** | **100%** | 3 / 14 | **84.6%** |
| Always vector | 27.8% | 3 / 14 | 57.9% |
| Always vectorless | 50.0% | **1 / 14** | 68.4% |
| Always fused | 22.2% | 5 / 14 | 78.3% |
| Random path | 47.2% | 2 / 14 | 63.2% |

**Always-fused is the most capable single path and it is not the right answer.** It
produces five false answers to the router's three. Sending everything down the strongest
path is not the same as sending each question down the right one; the deterministic pin on
an exact anchor is still the most reliable component in the system.

### `npm run eval:architectures` — which retrieval algorithm answers the question?

Nine architectures over **seven domains**, offline and deterministic. Full analysis in
[`ALGORITHM_COMPARISON.md`](./ALGORITHM_COMPARISON.md); raw results in
`ml/algorithm_comparison.md`.

| Architecture | Correct / 83 | Hold-out F1 | Spread |
|---|---|---|---|
| Standard RAG (lexical top-K) | 22 | 0.233 | 0.182 |
| Dense-embedding RAG | 11 | 0.104 | 0.139 |
| Hybrid lexical + dense (RRF) | 13 | 0.134 | 0.202 |
| Deterministic GraphRAG (bespoke handlers) | 28 | 0.233 | **0.351** |
| Agentic RAG (ReAct, 6 steps) | 42 | 0.234 | 0.127 |
| Query planner, 9 traversal primitives | 62 | 0.514 | 0.194 |
| Adaptive planner, 15 operators | 76 | 0.575 | 0.231 |
| Hybrid fused + graph expansion | 25 | 0.279 | 0.152 |
| **Hybrid + operator vocabulary (this system)** | **81** | 0.450 | **0.121** |

*Spread* is the gap between an architecture's best and worst domain — a large one means it
depends on a particular corpus rather than on a general capability.

Only `mediaops` is native to this repository. The other six — aerospace, retail,
manufacturing, logistics, finance and commerce — are hold-out for every architecture, and
each has a different topology (a chain, a star, a deep hierarchy, a routing network, a
directed payments network).

The findings worth carrying: better embeddings fix nothing structural; a ReAct agent
gathers context at 5.4 tool calls per query and never computes; and hand-written handlers
score best of any non-planner architecture on the domain they were written for, then lose
**60%** of it everywhere else — while typed operators *gain* 27%.

*False answers* — answered something the golden set says is unanswerable — is the number
that matters at 3am.

**Routing is exactly right and it is not the whole story.** The router hits every labelled
path, and beats every baseline on abstention F1. It does **not** win on false answers:
always-vectorless produces one where the router produces three. All three of the router's
misses arrive through the vector path on queries that are in-domain by vocabulary and
unanswerable in fact — `write me a poem about rendering`, `what does error code
TOTALLY_MADE_UP mean`, `what is the render budget for job 10000`. The similarity floor is
doing less work against domain-shaped nonsense than the BM25 coverage floor does. That is
a real finding about this design, produced by measuring it rather than by reasoning about
it, and it is the first thing I would fix.

**What the gate is worth** is measured by injection rather than argued. A deterministic
adversary that fabricates a citation on every turn is run twice, gate on and gate off. Gate
off: 30 answers reach the operator and **0%** of them carry a citation that resolves —
every one attributed to a source never retrieved. Gate on: all 30 withheld, false answers
0. The cost is visible in the same row — abstention F1 falls to 46.2%, because a model that
untrustworthy costs the operator every legitimate answer too. The gate does what it
promises and it is not free.

Full results, including the per-case divergence table and the scope caveats, in
[`ml/eval_report.md`](./ml/eval_report.md).

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

## Console to stored result

The sections above describe each decision in isolation. This one follows a single
question from the operator's keystroke to the row it leaves in Postgres, and documents
the parts of the surface the tables above do not cover.

### The console

Four components, one page, no client-side state machine — SWR keys are the coordination
mechanism.

| Component | Reads | Writes |
|---|---|---|
| `QueryBox` | — | `POST /query`, then revalidates both feed keys |
| `TransactionTable` / `TransactionRow` | `transactions:25` | — |
| `RationalePanel` | the row's embedded `rationale` | — |
| `FeedbackButtons` | the row's `feedback` | `POST /feedback`, then revalidates `rl-stats` |
| `RLPanel` | `rl-stats` | — |
| `StatusPill` | `health`, polled every 8s | — |

```
operator submits
  │
  ├─► POST /query ─────────────────► pipeline runs, row committed
  │      │
  │      └─ onAnswered()
  │           ├─ mutate("transactions:25") ─► GET /transactions?limit=25
  │           │                                 └─ row appears: answer · path · model ·
  │           │                                    band · Helpful / Unhelpful
  │           └─ mutate("rl-stats") ────────► GET /rl/stats
  │                                             └─ pull count moves
  │
  └─► operator expands the row  ─────► RationalePanel renders the stored rationale
  │                                    (no second request — it rode in on the row)
  │
  └─► operator clicks Helpful ───────► POST /feedback
         │
         └─ onRated()
              └─ mutate("rl-stats") ──────► arm mean reward moves
```

Three behaviours worth naming. The rationale panel issues **no request** — the whole
object ships inside the transaction row, which is what makes the explanation a record of
what happened rather than a reconstruction of it. `StatusPill` polls on its own clock, so
dependency failures surface without an operator having to ask a question first. And the
console never renders an answer from the `POST /query` response; it revalidates and reads
the row back, so what the operator rates is what was actually persisted.

Client-side guards mirror the server's: `QueryBox` blocks concurrent submits while a
request is in flight, and `FeedbackButtons` latches after one rating — the server enforces
the same with a `409`. A `503` is translated to *"No retrieval path is available right
now — check /health"* rather than shown raw.

### The rest of the HTTP surface

`POST /query` and `POST /feedback` are documented under [API](#api). The remainder:

<details>
<summary><code>GET /transactions?limit=n</code> · <code>GET /rl/stats?limit=n</code></summary>

```jsonc
// GET /transactions?limit=25   — limit 1..200, default 25, newest first
{ "transactions": [ { "id": "b1f0…", "query": "…", "answer": "…",
                      "path": "vectorless", "model": "llama3.2:3b",
                      "triage_class": "simple_lookup", "latency_ms": 940,
                      "grounded": true, "overlap_score": 0.62,
                      "confidence_band": "High", "hallucination_penalty": 0,
                      "exploring": false, "degraded": false,
                      "rationale": { /* … */ },
                      "citations": [ /* … */ ],
                      "created_at": "…",
                      "feedback": { "score": 1, "reward": 8.06, "created_at": "…" } } ],
  "count": 1 }

// GET /rl/stats?limit=200      — limit 1..1000 (reward series length)
{ "states": ["simple_lookup", "complex_diagnostic", "urgent_incident"],
  "arms": [ { "state": "simple_lookup", "action": "vectorless|llama3.2:3b",
              "path": "vectorless", "model": "llama3.2:3b",
              "pulls": 13, "rated_pulls": 9, "mean_reward": 7.4,
              "pull_share": 0.27, "last_updated": "…" } ],
  "total_pulls": 48,
  "series": [ /* reward over time */ ] }
```

`feedback` is `null` until rated — the unrated majority is visible rather than implied.
`pulls` and `rated_pulls` are both exposed so the gap between "served" and "observed" is
inspectable from outside.
</details>

<details>
<summary><code>GET /health</code> · <code>GET /metrics</code> · <code>GET /</code></summary>

```jsonc
// GET /health  — 200 when ok or degraded, 503 only when down
{ "status": "ok",                     // ok | degraded | down
  "checks": {
    "postgres":          { "name": "postgres", "status": "up" },
    "neo4j":             { "name": "neo4j", "status": "up",
                           "detail": "bolt://localhost:7687" },
    "vector_index":      { "name": "vector_index", "status": "up",
                           "detail": "34 chunks indexed" },
    "vectorless_index":  { "name": "vectorless_index", "status": "up",
                           "detail": "20 records" },
    "hybrid_index":      { "name": "hybrid_index", "status": "up",
                           "detail": "68 units, 108 edges, dense + lexical" },
    "ollama_generation": { "name": "openrouter.generation", "status": "up",
                           "latencyMs": 0 },
    "ollama_embedding":  { "name": "llm.embedding", "status": "up", "latencyMs": 0 } },
  "uptime_s": 236, "version": "1.0.0" }

// GET /  — service descriptor
{ "service": "mediaops-copilot-api", "version": "1.0.0", "routes": [ … ] }
```

Roll-up: any check `down` → `down`; any `degraded` → `degraded`; else `ok`. The check
*keys* are stable while the `name` inside reflects the runtime that actually answered —
`ollama_generation` reports `openrouter.generation` under `hybrid`, so a dashboard keyed
on the outer name survives a provider switch.

`GET /metrics` is Prometheus text exposition; the metric names are listed under
[Observability](#observability).
</details>

**Error envelopes.** Every failure is JSON, never a bare string:

```jsonc
{ "error": "invalid_request", "details": [ { "field": "query", "message": "…" } ] }  // 400
{ "error": "payload_too_large" }                                                    // 413
{ "error": "not_found", "path": "/typo" }                                           // 404
{ "error": "Unknown transaction" }                                                  // 404
```

**CORS** is `origin: *` limited to `GET`/`POST`/`OPTIONS` — a single-operator console with
no cookies to protect. Tightening the origin is the first change a shared deployment
needs.

### Access control on the typed surface

`/trpc/*` reads two headers into its context: `x-distinct-id` (caller identity, currently
carried but unused) and `x-operator-key`.

| Procedure | REST equivalent | Access |
|---|---|---|
| `query.ask` | `POST /query` | public |
| `feedback.rate` | `POST /feedback` | public |
| `health.check` | `GET /health` | public |
| `transaction.list` | `GET /transactions` | **operator** |
| `rl.stats` | `GET /rl/stats` | **operator** |

`operatorProcedure` compares `x-operator-key` against `OPERATOR_KEY`. **When
`OPERATOR_KEY` is unset the check is skipped entirely** — open by default so a clone runs
with no configuration, gated the moment the variable exists.

Two asymmetries to know before deploying this anywhere shared: the gate gets you
`UNAUTHORIZED` on the tRPC procedures only — **the REST twins of both operator routes are
ungated regardless** — and an unset `OPERATOR_KEY` is indistinguishable from a correctly
configured open one. Queries are stored verbatim, so `/transactions` is the route that
leaks incident detail. See [Security & safety](#security--safety).

### Agent tools

The ReAct loop's action space is a **closed whitelist**: two platform actions plus the
fifteen typed graph operators covered in
[Layer 4 — operator search](#layer-4--operator-search-computing-over-the-graph). Anything
the model emits that is not on the list is not dispatched — it is fed back as a
format error, so a hallucinated tool name costs a step rather than doing something.

| Tool | Mutating | Behaviour |
|---|---|---|
| `check_job_status(id)` | no | Reads the live job record |
| `restart_render(id)` | **yes** | **Mock** — records intent, mutates nothing |
| 15 graph operators | no | Read-only Cypher and GDS over Neo4j |

The split that matters here is **read versus write**, not traversal versus computation.
Only one tool in the whole space is mutating, and it is a mock.

Every call is persisted to `copilot.tool_invocation` with a `simulated` flag, so the audit
trail distinguishes *the agent read something* from *the agent wanted to change
something*. That column is the seam where a real control-plane call would land, and the
place a human-confirmation step would be enforced.

### What lands in Postgres

`platform.*` is reference data, re-seeded from repo fixtures on every boot and safe to
truncate. `copilot.*` is learned state that is never rebuilt.

| Table | Key | Columns |
|---|---|---|
| `platform.job` | `id` | `status`, `failure_reason`, `worker`, `duration_s`, `queued_at`, `job_class`, `priority`, `submitter` |
| `platform.error_code` | `code` | `meaning`, `severity`, `remediation` |
| `copilot.transaction` | `id` (uuid) | `query`, `answer`, `path`, `model`, `triage_class`, `latency_ms`, `grounded`, `overlap_score`, `confidence_band`, `hallucination_penalty`, `exploring`, `degraded`, `rationale` jsonb, `created_at` |
| `copilot.feedback` | `transaction_id` | `score`, `reward`, `created_at` |
| `copilot.bandit_arm` | `(state, action)` | `pulls`, `rated_pulls`, `mean_reward`, `last_updated` |
| `copilot.citation` | `(transaction_id, evidence_id)` | `source`, `score`, `excerpt` |
| `copilot.tool_invocation` | `id` | `transaction_id`, `tool`, `args` jsonb, `simulated`, `created_at` |

Two schema choices carry behaviour rather than describing it. `feedback` is keyed by
`transaction_id` **alone** — one rating per answer is a primary key, not application
logic, which is what makes the `409` unforgeable under concurrency. And `citation` is a
real table rather than a jsonb blob on the transaction, so "which evidence has this
system ever cited" is a query instead of a scan.

`knex-stringcase` maps `camelCase` in code to `snake_case` in the database; the column
names above are what a `psql` session shows.

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

**Classify it first.** Three failure shapes want three different runbooks, and the
expensive mistake is running the wrong one against the wrong shape.

| What you see | Shape | Runbook |
|---|---|---|
| 5xx, red status pill, crash loop | Something is **down** | **A** |
| Answers turned into "I don't know" | It is **refusing**, not failing | **B** |
| Answers still correct, latency climbing | It is **slow** | **C** |

#### A — something is down

1. **`copilot_dependency_up`** — the alertable form of `GET /health`: `1` up, `0.5`
   degraded, `0` down, per dependency. Postgres at `0` is the only fatal one; everything
   else is built to degrade rather than fail.
2. **`boot.failed` against `boot.listening`** — both present and alternating is a crash
   loop. `boot.failed` carrying `ECONNREFUSED` is almost always Postgres.
3. **`dep.circuit_open`** — the breaker tripped on a model runtime. It half-opens after
   the cooldown by itself and logs `dep.circuit_closed` on recovery. A single
   `dep.circuit_open` is not an incident.

#### B — it is refusing, not failing

Work down the ladder. The earlier signal moves first, so start at the top.

1. **`copilot_retrieval_hits`, bucket `0`** — the *leading* indicator. A zero-hit
   retrieval is a floor miss, and floor misses precede grounding failures. Pair it with
   `retrieval.floor_miss` in the logs, which carries both the top score and the floor it
   failed to clear — enough to tell corpus drift from a threshold that is simply wrong.
2. **`copilot_grounding_failures_total`, by `reason`** — which gate tripped. Each reason
   points somewhere different:

   | `reason` | Means | Look at |
   |---|---|---|
   | `no_evidence` | Nothing was retrieved | Back to B1 |
   | `low_overlap` | The answer drifted from its own citations | Model or corpus drift |
   | `phantom_citation` | The model invented a source | The model runtime |
   | `no_citations` | The model answered without citing | Prompt or model |
   | `empty_answer` | The model returned nothing | The model runtime |

3. **Pull one trace with `copilot.grounded=false`** and read `copilot.overlap` against
   `copilot.confidence_band`. Overlap sitting just under the floor across many traces is
   threshold tuning, not an outage.
4. **`agent.degraded`** rising means the ReAct loop fell back to extractive answers:
   generation is unreachable and the system is still serving. Correct behaviour, worth
   knowing.

#### C — it is slow

1. **`copilot_request_duration_seconds`** is labelled by `path` **and** `model`. Split by
   `model` first — one arm slow is a provider problem, every arm slow is yours.
2. **Open one trace.** `copilot.triage`, `copilot.retrieve` and `copilot.reason` are
   separate spans, so latency attributes to a stage with nothing further to instrument.
   `copilot.reason` dominating the trace is the model runtime, not the pipeline.
3. **`copilot.retrieve.fallback` present** means the vector path missed its floor and that
   query paid for two retrievals. Frequent fallback is a vector-index problem arriving
   disguised as a latency problem.
4. **`copilot_process_*`** — event-loop lag and heap, if none of the above moved.

#### Pivoting between the three signals

The correlation is already wired. Use it instead of grepping blind:

```
log line ──(trace_id)──► trace ──► spans carry the decisions
    │                               copilot.triage_class · copilot.retrieval_path
    │                               copilot.model · copilot.exploring · copilot.degraded
    └──(transaction_id)──► copilot.transaction ──► the stored rationale
```

Every log line carries `trace_id`, `span_id` and `transaction_id`. `transaction_id` is
also the primary key of `copilot.transaction`, so a single identifier moves you between
the live trace and the durable record of what the system decided and why — including for
a request that finished hours ago and has no trace left.

#### Do not do these

- **Do not restart to clear abstentions while embeddings are down.** The vector index is
  built **once, at boot**. Restarting with the embedding model unreachable brings the
  service back with the vector path disabled until the *next* restart — turning a
  recoverable degradation into a persistent one. Fix the dependency, then restart, in
  that order.
- **Do not truncate `copilot.*`.** It is the only copy of every rating anyone has ever
  given. `platform.*` is re-seeded from the repo on boot and is safe to drop.
- **`FORCE_VECTORLESS=true` is the escape hatch, not a fix.** It pins the deterministic
  path and will make open-ended questions abstain. It buys determinism by giving up
  coverage: the right trade at 3am, the wrong thing to leave switched on.

#### What is worth a page

| Signal | Page | Why |
|---|---|---|
| `copilot_dependency_up{dependency="postgres"} == 0` | **Yes** | Nothing can be recorded or learned |
| `boot.failed` twice within five minutes | **Yes** | Crash loop |
| `copilot_requests_total{status="5xx"}` rising | **Yes** | Real errors, not abstentions |
| `copilot_grounding_failures_total` rising | No — ticket | Working as designed; a quality regression |
| `copilot_retrieval_hits` zero-bucket rising | No — ticket | Leading indicator, not an outage |
| `copilot_rl_reward` falling for one arm | No — ticket | The policy routes around it on its own |
| `dep.circuit_open` | No | Self-healing by design |

The split matters more than the thresholds: this system is built to abstain and degrade
under failure, so most of its distress signals are **quality** regressions rather than
availability ones. Paging on abstention rate trains the on-call to ignore the pager.

## Failure modes

The contract: **degrade to a narrower but still-grounded answer, or abstain — never
crash, never guess.**

| Failure | Behaviour | Operator sees |
|---|---|---|
| Hosted provider unreachable | Generation retries on local Ollama | Answer served; `/health` notes the degradation |
| Both runtimes unreachable | Vectorless returns the raw record as a templated answer | `degraded: true`, rationale explains why |
| One model tag missing | Action space masked; the arm is **not** penalised | The surviving arm |
| Embedding model down | Vector path disabled; queries pinned to the fused path, which still covers records and prose lexically and by traversal | Amber pill; purely semantic phrasings may abstain |
| Retrieval below floor | Abstain + escalation hint, penalty applied | Amber "I don't know" row |
| Phantom citation | Answer replaced by abstention | Explanation naming the invalid citation |
| Agent budget exhausted | Abstain rather than force an answer | Rationale states the budget |
| Neo4j unavailable | Structural questions abstain; `vector` and `vectorless` keep serving | Health reports `neo4j: down` |
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
| `hybrid` | 16 | RRF rank-only fusion; MMR diversification; graph expansion and hop provenance; degraded-embedder coverage; OOD abstention; structural routing. Retriever cases gated on Neo4j |
| `domains` | 31 | Every registered domain builds cleanly; no undeclared edge types; **every benchmark answer key still resolves**; the aerospace reconstruction figures; GDS centrality and component detection. Gated on Neo4j |
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
| `test` | Both suites against real Postgres 16 and Neo4j 5 (with the GDS plugin) services, with `REQUIRE_POSTGRES=true` and `REQUIRE_NEO4J=true` so a skipped suite is a red build |
| `ml` | `pip install -r requirements.txt`, regenerate the dataset, retrain with scikit-learn, **fail if the committed CSV is stale**, re-run the classifier suite against the retrained model |
| `build` | Build both Docker images, then smoke-test the API image against real Postgres and Neo4j: `/health` must not be `down`, migrations must have applied, the graph must have synced, and an error-code query must take the `vectorless` path |
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
| `VECTOR_COVERAGE_FLOOR` | `0.4` | Share of query terms a *weak* vector hit must cover |
| `VECTOR_STRONG_SCORE` | `0.7` | At or above this similarity, the coverage floor is waived |
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
- **The golden set is labelled against the same fixtures the system serves.** It shows
  routing, floors and the gate behaving as designed on known data — not how they behave on
  real operator traffic. The 12 abstention cases transfer best, because "should refuse" is
  a property of the corpus rather than of phrasing.
- **The similarity floor under-refuses domain-shaped nonsense.** Measured, not suspected:
  all three of the router's false answers come through the vector path on queries that
  share vocabulary with the corpus but have no answer in it.
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
      context.ts                composition root (generator · embedder · retrievers · bandit · grounder)
      config.ts
      connections/              db · http · ollama · openrouter · llmFactory · llmFake
      otel/                     sdk · bootstrap · middleware · metrics · spans · logBridge
      utils/                    logger · metrics · stopwords · circuitBreaker
      scripts/                  generateDataset
      eval/                     goldenSet · strategies · harness · metrics ·
                                report · adversarialLlm · run
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
                                synthetic_dataset.csv · metrics_report.md ·
                                eval_report.md (generated by `npm run eval`)
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
