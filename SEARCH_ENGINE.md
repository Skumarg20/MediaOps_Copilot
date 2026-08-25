# Better Search: What Is Wrong With Normal RAG, and What To Build Instead

A reading of one paper and four vendor architectures, mapped onto the retrieval layer
that exists in this repository today. Nothing here has been implemented — this is the
understanding document that comes first.

**Sources are listed in full at the end ([References](#references)); inline markers like
[[1]](#ref1) point there.**

---

## TL;DR

Normal RAG treats a corpus as a bag of flat text chunks and retrieves by vector
similarity. That works when the answer is *locally contained* — sitting inside one or
two passages. It fails, systematically and unfixably, when the answer has to be
*assembled* across records, or *computed* over the structure connecting them.

The failure is not a tuning problem. Better embeddings do not fix it. The paper
[[1]](#ref1) tested exactly that: swapping TF-IDF for dense `all-MiniLM-L6-v2`
embeddings improved recall but left **all six structurally dependent query categories
still failing**. You cannot retrieve your way to a count, a comparison, or an absence.

The fix that all five sources converge on: **keep vector search, but stop asking it to
be the whole retriever.** Use it to find entry points, then let an explicit graph over
your entities carry the answer the rest of the way — and expose the graph operations as
named tools, not as hand-written handlers.

For this repository specifically, the highest-value work is not a better embedding
model. It is (a) making the runbook prose keyword-searchable at all, (b) building the
job → error-code → runbook graph that currently does not exist, and (c) adding
structural cases to the golden set so the failure class becomes measurable.

---

## Part 1 — What Is Actually Wrong With Normal RAG

### 1.1 The canonical pipeline, and where it breaks

Standard RAG is three stages: **index** (chunk documents, encode as vectors),
**retrieve** (top-*K* by cosine similarity), **generate** (condition the model on the
retrieved chunks) [[1]](#ref1), after Lewis et al.

The load-bearing assumption is that relevance is a *similarity* relation between the
query and one chunk. Whenever the answer is a property of how chunks relate to each
other, that assumption is simply false, and no amount of top-*K* fixes it.

The paper gives this a precise definition. A query is **structurally unreachable** when
no amount of top-*K* chunk retrieval can produce a correct answer in a single retrieval
step, *regardless of embedding model quality, chunk size, or K value*. Two causes
[[1]](#ref1):

- **Retrieval incompleteness** — the answer needs information distributed across
  multiple chunks with no single chunk containing all required entities.
- **Computational irreducibility** — the answer needs a computation over topology
  (counting in-degrees, computing set complements, aggregating weighted paths) that
  cannot be expressed as a similarity search at all.

### 1.2 The six failure modes

The paper's taxonomy (its Table VII), which generalises well beyond its supply-chain
domain [[1]](#ref1):

| Failure mode | Root cause | Question it kills |
|---|---|---|
| **Absence blindness** | Cannot represent missing edges | "Which components have *no* alternative supplier?" |
| **Degree blindness** | Cannot count in/out-degree | "Which node is a single point of failure?" |
| **Complement blindness** | Cannot compute "everything except X" | "Which customers are *not* affected?" |
| **Topology blindness** | Cannot compare subgraph properties | "Is A more exposed than B?" |
| **Propagation blindness** | Cannot compute weighted multi-hop scores | "Rank everything by blast radius" |
| **Temporal blindness** | No validity windows on chunks | "Who is the supplier *now*?" |

Absence blindness is the sharpest of these. RAG can only find what *matches* the query.
It has no representation for what is *not there*. Ask "which error codes have no
runbook?" and a similarity search will cheerfully return the codes that *do* have one.

Microsoft frames the same territory in two failure modes [[2]](#ref2): baseline RAG
"struggles to connect the dots… when answering a question requires traversing disparate
pieces of information through their shared attributes", and it "performs poorly when
being asked to holistically understand summarized semantic concepts over large data
collections."

Neo4j names a third that matters enormously in practice [[6]](#ref6): **aggregation
failures**. Ask "how many open tickets exist?" and vector search returns a fixed top-*k*
— so the model confabulates the total *from the number of chunks it happened to
receive*. The answer is not merely wrong; it is wrong in a way that looks perfectly
grounded, because every chunk cited is real. This is the most dangerous class of RAG
error there is.

AWS puts the whole problem in one sentence [[4]](#ref4):

> "Vector search excels at finding what is semantically similar, but it cannot reveal
> what is structurally connected."

### 1.3 The empirical evidence, with numbers

This is the part worth internalising, because it kills the two most common objections
("just use better embeddings", "just use an agent").

**Better embeddings do not fix it** [[1]](#ref1). Across 11 queries:

| Architecture | Correct | Partial | Fail |
|---|---|---|---|
| Standard RAG (TF-IDF) | 0 | 2 | 9 |
| Dense-embedding RAG (`all-MiniLM-L6-v2`) | 1 | 4 | 6 |
| LightRAG (v1.4.16) | 3 | 6 | 2 |
| Agentic RAG (ReAct, 20 steps) | 5 | 3 | 3 |
| LLM-based GraphRAG | 1 | 6 | 4 |
| Deterministic GraphRAG | **11** | 0 | 0 |

Dense embeddings moved one query from Fail to Correct. Every structurally dependent
category still failed. LightRAG extracted a *far richer* graph than the reference
implementation — 244 entities and 362 relationships versus 48 and 68 — and **still**
failed on inverse queries and risk propagation [[1]](#ref1). More extraction is not the
answer either.

**Agents do not fix it.** A ReAct agent with a 20-step budget and four retrieval tools
scored 5 Correct / 3 Partial / 3 Fail at ~9,480 ms and ~199k tokens per query
[[1]](#ref1). It hallucinated suppliers on the what-if query and found 1 of 15
single-source components on the SPOF query. Iterative retrieval addresses *incomplete*
context; it has no mechanism to guarantee **complete traversal** of an implicit graph
embedded across text chunks.

**Hand-writing handlers does not scale.** The paper built 11 bespoke handlers: 50–200
lines each (median ~120), ~6 intent-classifier training phrases apiece, 2–8 hours of
engineering per handler. On a hold-out set of unseen queries, that bespoke system
**dropped from F₁ 0.574 to 0.379 — a 34% relative decline** [[1]](#ref1). It had been
co-designed with its own test set and did not generalise.

**What did work** — and this is the thesis — was replacing all 11 handlers with a single
LLM query planner given **nine typed graph primitives** as tools. It went the other way
on hold-out: 0.557 → **0.700**, for an overall F₁ of 0.632 versus 0.472 for the bespoke
handlers [[1]](#ref1). Adding six *computation* primitives (Architecture 8) let the
model answer in two steps what it previously could not finish in twenty.

> "The limiting factor in graph-augmented retrieval is not the LLM's reasoning
> capability but the operator vocabulary available to it." [[1]](#ref1)

Practitioners should invest in **curating the right operator vocabulary** — a library of
typed, composable graph operations exposed as tools. When a new query category appears,
you add a tool, not a handler.

### 1.4 One honest caveat before we go further

Two things in the sources deserve to be stated plainly rather than glossed.

**Graph structure does not automatically improve faithfulness.** Microsoft measured
faithfulness with SelfCheckGPT and found GraphRAG "achieves a *similar* level of
faithfulness to baseline RAG" [[2]](#ref2). GraphRAG wins on comprehensiveness and on
connecting the dots. It is *not* a hallucination fix on its own. Whatever grounding gate
you have, you still need it — arguably more, because graph-assembled answers draw on
more sources and have more surface area to drift from.

**The paper's own headline metric is partly broken, and it says so.** Entity-level F₁
systematically *underscores* structural queries: on its aggregation query, the answer was
correct, but F₁ was 0.22 because ground truth listed 3 entity IDs while a genuinely
comprehensive answer named 23 [[1]](#ref1). The extra correct entities counted as false
positives. Its other limits are stated openly too: a single synthetic 46-node domain,
one model family (Claude Haiku 4.5) acting as both generator and judge, handlers
co-designed with their own test set, and inter-annotator agreement of κ = 0.716
(substantial, not near-perfect). Treat the *direction* of these findings as solid and
the exact figures as indicative.

---

## Part 2 — Where This Repository Sits Today

I read the whole retrieval path end to end. Here is the honest assessment.

### 2.1 What exists

Two **mutually exclusive** retrieval paths, chosen per query:

- **`vector`** (`modules/retrieval/services/vector.ts`) — dense embeddings over six
  markdown runbooks (~13 KB total), chunked at 500 chars with 80 overlap, heading-aware.
  Admission floors: cosine ≥ 0.45, plus either cosine ≥ 0.7 or query-term coverage ≥ 0.4.
- **`vectorless`** (`modules/retrieval/services/vectorless.ts`) — exact anchor lookup on
  job IDs and error codes, falling back to BM25 over job and error-code *records*.
  Floors: BM25 ≥ 1.2 and coverage ≥ 0.5.

A deterministic router (`modules/routing/services/rules.ts`) pins to `vectorless` when a
job ID or error code resolves; otherwise an ε-greedy bandit picks the path. `topK = 3`.
If the chosen path returns nothing, the pipeline tries the other one once. A grounding
gate (`modules/grounding/`) validates every cited ID against retrieved evidence and
measures bag-of-words overlap, abstaining below 0.25.

**Credit where due:** the abstention gate, the deterministic-pin-over-similarity
instinct, and the citation validation are genuinely good and ahead of most RAG systems.
The `vectorless` retriever even follows one hop — job → `failureReason` → error code.
That instinct is exactly right. It just stops after one hop and never leaves the
database.

### 2.2 The five concrete gaps

**Gap 1 — The runbooks are not keyword-searchable at all.**
`VectorlessRetriever.build()` indexes only jobs and error codes into BM25. The six
runbooks are reachable *exclusively* through dense embeddings. If Ollama is down, or a
query uses an exact term the embedding smooths over, the entire prose corpus is
invisible. Every source here recommends hybrid lexical + dense retrieval over the *same*
content [[4]](#ref4)[[6]](#ref6). Right now the two indexes cover disjoint content, so
they can never reinforce each other.

**Gap 2 — Records and prose are two disconnected islands.**
There is no link from `job:482` → `RENDER_TIMEOUT` → the "Retrying a failed job safely"
section of `runbook-timeouts-and-retries.md`. Ask *"how do I fix job 482?"* and the
router pins to `vectorless` (a job ID resolved), which returns the job record and the
error-code remediation — and **never reads the runbook**, which is where the actual
drain-versus-retry judgement lives. The answer is grounded, cited, and incomplete.

This is Microsoft's "connect the dots" failure [[2]](#ref2) and Neo4j's "incomplete
context" [[6]](#ref6), in your codebase, on your most common question shape.

**Gap 3 — The paths compete instead of combining.**
`vector` OR `vectorless`, never both. The bandit optimises *which single path wins*. But
the four vendor architectures [[3]](#ref3)[[4]](#ref4)[[5]](#ref5)[[6]](#ref6) all do
both and *fuse*. A diagnostic question genuinely needs the record (which job, which
worker, which code) **and** the prose (what that means, what to do). Forcing a choice
guarantees a partial answer on exactly the queries that matter most.

**Gap 4 — Whole classes of operational question are unanswerable.**
From your actual `jobs.json` (12 jobs, 8 error codes, 7 failures):

| Question | Why it fails today | Failure mode |
|---|---|---|
| "Which worker is causing the most timeouts?" | Needs a count over all jobs grouped by worker. `topK=3` cannot count. **The answer is `worker-07` — 3 of 12 jobs, 3 of 7 failures, 2× `RENDER_TIMEOUT` + 1× `RENDER_STALLED`.** | Degree blindness |
| "Which jobs failed for the same reason as 482?" | Needs job → code → *back* to all other jobs. The one hop that exists is one-way. | Retrieval incompleteness |
| "Which error codes have no runbook coverage?" | Needs a set complement. **5 of 8 codes are mentioned in no runbook: `RENDER_STALLED`, `ASSET_UNSUPPORTED_CODEC`, `WORKER_EVICTED`, `QUEUE_SHED_DEFERRED`, `FONT_MISSING`.** | Absence + complement blindness |
| "Is job 482 the same problem as 487?" | Needs two subgraphs compared. | Topology blindness |
| "Did anything change after the deploy window?" | `queuedAt` exists on records but nothing is time-filterable. | Temporal blindness |

The `worker-07` finding is the one to sit with. It is a real operational signal — one
worker producing 43% of all failures — that is present in your data, and your search
engine structurally cannot surface it.

**Gap 5 — The golden set cannot see any of this.**
`eval/goldenSet.ts` has 41 well-built cases in three buckets: exact-anchor lookups,
open-ended prose questions, and out-of-domain abstentions. There is **not one
aggregation, comparison, complement, or multi-hop case**. So the entire failure class
this literature is about is currently invisible to your evaluation. You could ship every
fix below and the numbers would not move, because nothing measures it.

Fix this first. It is the cheapest item on the list and it is what makes everything else
provable.

---

## Part 3 — What "Better Search" Actually Means

Strip away vendor branding and all five sources describe the same four-stage shape.

```
  query
    │
    ├─► 1. ENTRY POINTS ────────────────────────────────────────────
    │      exact anchors  +  lexical (BM25)  +  dense (vectors)
    │      "find me somewhere true to start"
    │
    ├─► 2. STRUCTURAL EXPANSION ────────────────────────────────────
    │      walk typed edges from those entry points
    │      "the answer is usually 1–3 hops from where you landed"
    │
    ├─► 3. FUSION + RANKING ────────────────────────────────────────
    │      merge incomparable score scales, dedupe, diversify
    │      "one ranked list, not three"
    │
    └─► 4. GROUNDED GENERATION ─────────────────────────────────────
           cite, verify, abstain when unsupported
```

### 3.1 What each source contributes

**Microsoft GraphRAG** [[2]](#ref2)[[3]](#ref3) — the *indexing* discipline. Its pipeline
runs: load documents → chunk into TextUnits → extract graph (entities + relationships) →
extract claims → embed → detect communities and generate community reports. The
distinctive move is **hierarchical community summarisation**: cluster the graph, have an
LLM write a summary per cluster, and index those summaries as first-class retrievables.
That is what makes whole-corpus questions answerable.

It then splits querying by question shape, which is the part to steal:

| Mode | For | Pulls |
|---|---|---|
| **Local Search** | Questions about a specific entity | Graph neighbourhood + the source chunks behind it |
| **Global Search** | Whole-corpus, thematic questions | Community reports, map-reduced |
| **DRIFT Search** | Local, but needing wider context | Entity data + community context, then follow-up questions |
| **Basic Search** | Baseline comparison | Plain top-*k* vector |

Note that Local Search returns *graph data plus raw text*. Even the graph-native mode
keeps the original passages, because that is what a citation has to point at.

**AWS** [[4]](#ref4) — the two *composition orders*, and the recognition that both are
valid:
- **Vector-first-then-graph**: similarity finds entry points, traversal expands. Their
  example: searching "rechargeable electric toothbrush" surfaces the product by vector,
  and graph edges then surface dental floss — connected, but not semantically similar.
- **Graph-first-then-vector**: traversal finds all structurally connected candidates,
  then vector similarity *ranks* them by relevance.

Their GraphRAG example is worth keeping in mind: vector RAG retrieves holiday demand and
product-innovation articles about a company, but misses that its logistics partner
depends on a currently blocked shipping canal. The graph connects company → partner →
canal → blockage. No embedding will do that, at any K.

**Google Cloud (Spanner Graph)** [[5]](#ref5) — the *storage* lesson. One store holds
both the graph and the embeddings, so a vector hit and a graph node are the same object;
there is no join across two systems and no drift between them. Query flow: embed query →
vector-similarity search to find graph nodes → traverse → **re-rank with a ranking API**
→ summarise. That explicit re-rank stage after fusion is easy to skip and matters.

Worth noting honestly: this reference architecture covers infrastructure and says
essentially nothing about citations, hallucination mitigation, or accuracy validation.
That layer is yours to own.

**Neo4j** [[6]](#ref6) — the *routing* lesson, concretely. Three retrievers behind one
agent: a vector index for semantic similarity, full-text for exact terms, and generated
Cypher for aggregations and multi-hop traversals. An agent picks the tool based on the
question. Their explicit motivation: vector-only systems make it "difficult to trace why
a particular document was retrieved" — graph retrieval is *explainable by construction*,
because the traversal path **is** the explanation.

**The paper** [[1]](#ref1) — the *interface* lesson, which supersedes Neo4j's
text-to-Cypher for a system like yours. Do not generate query language; do not
hand-write handlers. Expose a fixed library of typed, composable primitives as tools:

*Traversal (9):* `find_nodes`, `get_node`, `get_neighbors`, `shortest_path`, `subgraph`,
`count_edges`, `set_complement`, `filter_edges_by_date`, `propagate_risk`
*Computation (6):* `simulate_removal`, `subgraph_diff`, `aggregate_over_type`,
`betweenness`, `pagerank`, `connected_components`

The distinction that makes this work: each computation tool encapsulates a **complete
algorithm**, not a primitive step — so the model makes *one* call where a traversal-only
agent would need a multi-step loop it cannot afford. Adoption was appropriately
selective: the model called `aggregate_over_type` for aggregation queries and ignored the
computation tools for traversal-native ones [[1]](#ref1).

### 3.2 The one thing none of them will give you

Every source assumes the model gets good context and then answers. Your existing
grounding gate — validate citations, measure overlap, abstain below floor — is the piece
none of these architectures ship, and Microsoft's own faithfulness finding [[2]](#ref2)
says graph structure will not substitute for it.

Keep it. Extend it. When evidence starts arriving via traversal rather than similarity,
each citation should carry **how it was reached** — the hop path — so a reviewer can
audit not just *that* a fact was retrieved but *why*. Graph retrieval is explainable by
construction [[6]](#ref6); it would be a waste to throw that provenance away at the
citation boundary. (Microsoft is building in this direction too, with VeriTrail for
hallucination detection and provenance tracing [[2]](#ref2).)

---

## Part 4 — What To Implement

Ordered by payoff per unit of effort. Each stage is independently shippable and
independently measurable.

### Stage 0 — Make the problem measurable *(do this first)*

Add structural cases to `eval/goldenSet.ts`. Roughly a dozen, covering: aggregation
("which worker fails most"), inverse ("what else failed like 482"), complement ("which
codes lack a runbook"), multi-hop ("how do I fix 482" — must cite both the code *and* the
runbook), comparison, and temporal.

Expect these to fail at first. That is the point: a baseline you can move. Without this
you are optimising blind.

**Effort: hours. Unblocks everything else.**

### Stage 1 — Close the lexical gap

Index the runbook chunks into BM25 alongside jobs and error codes, so both indexes cover
all content. Then run lexical and dense retrieval *together* rather than either/or, and
fuse the results.

Fuse with **Reciprocal Rank Fusion** — score by `Σ 1/(k + rank)`, `k ≈ 60`. RRF uses only
rank position, never raw scores, which is what makes it correct here: BM25 scores and
cosine similarities live on incomparable scales and cannot be sensibly added or weighted
without calibration. RRF sidesteps the calibration problem entirely.

Raise `topK` from 3 to ~6 once fusion is in, and add MMR diversification so the extra
slots bring genuinely different content rather than three near-duplicate chunks of one
section.

**Effort: small. This alone fixes real failures and needs no graph.**

### Stage 2 — Build the graph

An explicit, pre-defined schema — no LLM extraction. Unlike Microsoft's use case, your
entities are already structured; you would only be adding extraction noise. The paper
makes this same choice deliberately [[1]](#ref1).

*Nodes:* `Job`, `ErrorCode`, `Worker`, `JobClass`, `Submitter`, `DocSection`
*Edges:* `Job -FAILED_WITH-> ErrorCode`, `Job -RAN_ON-> Worker`, `Job -OF_CLASS-> JobClass`,
`Job -SUBMITTED_BY-> Submitter`, `DocSection -DOCUMENTS-> ErrorCode`,
`DocSection -ADJACENT_TO-> DocSection`

Carry `queuedAt` onto job edges so date filtering works later — retrofitting temporal
metadata is painful, and TG-RAG's ablation found that removing temporal retrieval dropped
correctness from 0.599 to 0.382, a 36% degradation [[1]](#ref1).

**One thing to watch, from your actual data:** the `DocSection -DOCUMENTS-> ErrorCode`
edge cannot be built from literal string matching alone. Only 3 of your 8 codes are
mentioned by name in any runbook. The remaining five need either embedding-similarity
linking between the code's `meaning`/`remediation` text and runbook sections, or a small
hand-maintained mapping. This is a genuine design decision, not a detail — and building
the graph is what makes the gap visible in the first place.

Scale is a non-issue: 12 jobs, 8 codes, ~40 chunks. The paper's engine ran at 0.51 ms
average on 46 nodes and 3.07 ms at 1,100 nodes, worst-case P95 11 ms [[1]](#ref1). An
in-memory graph rebuilt at boot is entirely sufficient; you do not need a graph database.

### Stage 3 — Expand along the graph

Take the fused top hits from Stage 1 as **seed nodes**, then walk 1–3 hops to pull in
structurally connected evidence. Weight decays per hop — the paper uses 1-hop 1.0, 2-hop
0.6, 3-hop 0.35, 4-hop 0.2 [[1]](#ref1) — so a runbook section two hops from a named job
gets ranked *without ever having matched the query's words*. That is the retrieval flat
top-*K* cannot reach, and it is what finally answers "how do I fix job 482?" completely.

Then re-rank the combined set (the explicit stage in Google's flow [[5]](#ref5)) and cap.

Two guardrails, both important:
- **Only expand from seeds that passed a floor.** Otherwise an out-of-domain query with
  one weak accidental match expands into a plausible-looking pile of evidence, and your
  hard-won abstention behaviour quietly dies. Re-run the OOD golden cases after this
  stage specifically.
- **Record the hop path on every expanded item** and carry it into the citation. This is
  the provenance that makes graph retrieval auditable.

### Stage 4 — Give the agent the operator vocabulary

Your ReAct loop currently has two tools — `check_job_status` and `restart_render` — and a
3-step budget. Neither tool retrieves anything. Add typed graph primitives as tools, in
priority order for your domain:

1. `aggregate_over_type` — "which worker fails most" (Gap 4, row 1)
2. `get_neighbors` — typed one-hop expansion
3. `set_complement` — "which codes have no runbook"
4. `find_nodes` — attribute-filtered scan
5. `subgraph_diff` — "is 482 the same problem as 487"
6. `filter_edges_by_date` — temporal windows
7. `shortest_path` — "how are these two connected"

Raise `AGENT_MAX_STEPS` from 3 — but note the paper's finding that the planner used
*fewer* tool calls than the agentic baseline (4.9 vs 5.3) while scoring higher, because
better tools beat more steps [[1]](#ref1). And follow the system-prompt guidance that
made adoption work: tell the model explicitly *which tool goes with which question
shape*, e.g. "for aggregation queries, use `aggregate_over_type` INSTEAD of manually
iterating."

### Stage 5 — Extend grounding to structural answers

Two additions once evidence arrives by traversal:

- **Provenance in citations** — each cited item carries how it was reached (direct hit,
  or the hop path), so a reviewer can audit the route as well as the fact.
- **Span-level attribution** — match each answer *sentence* to a supporting span in cited
  evidence rather than scoring bag-of-words overlap across the whole answer. Aggregated
  answers are long and paraphrased; whole-answer overlap will either wave through
  unsupported sentences or reject good answers wholesale.

Be careful here: your current gate is well-calibrated against your existing golden set.
Change it additively and re-run the full set, or you will trade a real hallucination
defence for a speculative one.

### What to deliberately *not* build

- **Community detection / community summaries.** Microsoft's hierarchical clustering
  [[3]](#ref3) earns its cost on large narrative corpora. You have six runbooks and
  ~13 KB of prose. The whole corpus fits in a context window; clustering it would be
  ceremony.
- **A graph database.** Millisecond in-memory traversal at your scale, rebuilt at boot.
- **LLM entity extraction.** Your entities are already typed rows in Postgres. Extraction
  would only add noise — and LightRAG's richer extracted graph still failed the
  structural queries [[1]](#ref1).
- **Text-to-Cypher.** Neo4j's approach [[6]](#ref6) fits a graph-database deployment. For
  you, typed primitives are safer (no generated-query injection surface, no syntax
  failures) and the paper's evidence favours them.

### Sequencing at a glance

| Stage | Work | Fixes | Effort |
|---|---|---|---|
| 0 | Structural golden cases | Makes the problem visible | Hours |
| 1 | BM25 over prose + RRF fusion | Gaps 1, 3 | Small |
| 2 | Typed graph over existing data | Foundation for 3–4 | Small–medium |
| 3 | Hop-decayed expansion + re-rank | Gap 2 | Medium |
| 4 | Graph primitives as agent tools | Gap 4 | Medium |
| 5 | Provenance + span attribution | Trust in the above | Medium |

Stages 0 and 1 are worth doing regardless of whether you ever build the graph.

---

## Part 5 — How You Will Know It Worked

Your eval harness (`eval/harness.ts`, `eval/strategies.ts`) already compares retrieval
strategies side by side over a golden set — genuinely good infrastructure for this, and
the same design the paper used [[1]](#ref1). Add a `hybrid_fused` strategy alongside
`routed` and `always_vector` and let the numbers arbitrate.

Track four things, and resist collapsing them into one score:

1. **Answerability on structural cases** — from a 0/12 baseline. The headline number.
2. **No regression on existing cases** — all 41 current golden cases, especially the OOD
   abstentions. Stage 3 is where these are most at risk.
3. **Citation completeness on multi-hop cases** — "how do I fix 482" must cite the job,
   the error code, *and* the runbook section. Partial citation is the specific failure
   this whole effort is meant to eliminate.
4. **Latency** — graph traversal is sub-millisecond at your scale; if p95 moves
   meaningfully, something is wrong.

One measurement warning, learned the hard way in the paper [[1]](#ref1): **do not score
structural queries with a flat entity-overlap metric.** A correct aggregation answer
naming 23 entities scored F₁ = 0.22 against a ground truth listing 3, because the extra
*correct* entities counted as false positives. Structural queries need task-specific
metrics — ranking accuracy for aggregation, causal coverage for what-if, set correctness
for complement. Otherwise your metric will punish exactly the improvement you built.

---

## References

<a id="ref1"></a>**[1] Grama Chethan, "Beyond Vector Similarity: A Structural Analysis of
Graph-Augmented Retrieval for Industrial Knowledge Graphs."** arXiv:2606.06003v1 [cs.AI],
4 June 2026 (v3.0). Siemens Digital Industries Software, AI & Analytics.
Local copy: `C:\Users\Sanjeev\Downloads\2606.06003v1.pdf`
*The backbone of this document.* Compares eight retrieval architectures over a 46-node,
64-edge aerospace supply-chain knowledge graph across 23 queries in 10 intent categories.
Contributes: the definition of structurally unreachable queries (§III); the six-mode
failure taxonomy (Table VII); the empirical result that dense embeddings do not cross the
structural barrier (§V-E); the operator-vocabulary thesis and the typed-primitive
libraries (Tables XII, XIV, XVI); hop-decay propagation (Eq. 1); and the measurement-gap
warning on entity-level F₁ (§VII-D).

<a id="ref2"></a>**[2] Microsoft Research — GraphRAG project page and announcement.**
https://www.microsoft.com/en-us/research/project/graphrag/
Contributes: the two baseline-RAG failure modes ("connecting the dots", holistic
understanding); the entity-extraction → community-detection → community-summary pipeline;
Local vs Global search; the finding that GraphRAG faithfulness is *comparable to*, not
better than, baseline RAG; VeriTrail for provenance tracing.

<a id="ref3"></a>**[3] Microsoft GraphRAG — Indexing Architecture.**
https://microsoft.github.io/graphrag/index/architecture/
Contributes: the Knowledge Model abstraction; the six-stage pipeline (load → chunk →
extract graph → extract claims → embed → community detection and report generation); LLM
caching for idempotent indexing; factory-based extensibility.
Query modes referenced from https://microsoft.github.io/graphrag/query/overview/
(Local, Global, DRIFT, Basic Search).

<a id="ref4"></a>**[4] AWS Database Blog — "Improving generative AI accuracy with vector
and graph search hybrid queries."**
https://aws.amazon.com/blogs/database/improving-generative-ai-accuracy-with-vector-and-graph-search-hybrid-queries/
Contributes: the framing quote on similarity versus structural connection; the
vector-first-then-graph and graph-first-then-vector composition patterns; the supply-chain
worked example showing what similarity alone misses.

<a id="ref5"></a>**[5] Google Cloud Architecture Center — "GraphRAG with Spanner Graph."**
https://docs.cloud.google.com/architecture/gen-ai-graphrag-spanner
Contributes: co-locating graph and embeddings in one store; the query flow of embed →
vector search for entry nodes → graph traversal → **explicit re-ranking** → summarise.
Note: covers infrastructure only; offers no application-level grounding or citation
guidance.

<a id="ref6"></a>**[6] Neo4j Developer Blog — RAG tutorial (vector + graph hybrid
retrieval).** https://neo4j.com/blog/developer/rag-tutorial/
Contributes: the aggregation-failure mode (top-*k* causes the model to confabulate totals
from retrieval count); the explainability argument (vector-only retrieval cannot say
*why* a document was retrieved); chunk fragmentation causing incomplete context; the
three-retriever pattern (vector index + full-text + generated Cypher) with agent-based
tool routing; variable-length path traversal for indirect dependencies.

### Repository files this analysis is grounded in

`apps/api/src/modules/retrieval/services/{vector,vectorless,bm25,chunker}.ts` ·
`apps/api/src/modules/routing/services/rules.ts` ·
`apps/api/src/modules/query/services/pipeline.ts` ·
`apps/api/src/modules/grounding/services/{gate,citations,overlap}.ts` ·
`apps/api/src/modules/agent/services/{reactLoop,tools,prompts}.ts` ·
`apps/api/src/eval/{goldenSet,harness,strategies}.ts` ·
`apps/api/src/config.ts` ·
`apps/api/src/modules/platform/data/{jobs.json,errorCodes.json,mockDocs/*.md}`

Data facts cited above (12 jobs, 8 error codes, 7 failures, `worker-07` accounting for 3
of them, 5 of 8 codes unmentioned in any runbook) were computed directly from those files.
