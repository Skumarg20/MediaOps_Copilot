# Which Retrieval Algorithm Actually Answers the Question

Nine retrieval architectures, run over **seven unrelated domains**, scored query by query.
This is the analysis; the raw generated results live in
[`ml/algorithm_comparison.md`](./ml/algorithm_comparison.md) and are reproduced by:

```bash
npm run eval:architectures --workspace=apps/api    # no database, no model runtime, no API keys
```

The companion documents: [`SEARCH_ENGINE.md`](./SEARCH_ENGINE.md) is the reading of the
sources that came first; this file is what happened when the algorithms were built and
measured. Sources are listed in full at the end; inline markers like [[1]](#ref1) point
there.

---

## TL;DR

**The barrier is not embedding quality, and it is not the agent loop.** Swapping lexical
retrieval for dense embeddings moved the score *down* (22 correct → 11 of 83) and fixed
none of the ten structurally dependent categories. Giving a ReAct agent six retrieval
steps helped on traversal-shaped questions and left aggregation, absence, comparison and
propagation exactly where they were — at zero.

**The barrier is the operator vocabulary.** Nine typed traversal primitives took correct
answers from 22/83 to 62/83. Adding six graph-computation operators took it to 76/83.
That is the reference paper's thesis [[1]](#ref1), and it reproduced across six domains it
has never seen.

**One corpus proves nothing, and this is the number that shows it.** Hand-written handlers
were the strongest non-planner architecture *on the domain they were written for*
(F1 0.579) and dropped to 0.183 on aerospace — a **68% relative decline**, and the largest
best-to-worst spread of any architecture at 0.399. The typed-operator planners went the
other way: 0.454 on the original domain, **0.575** on hold-out.

**Consistency across domains is itself a result.** The shipped configuration has the
*smallest* spread between its best and worst domain (0.121) of any architecture measured,
and no outright failure on any of the 83 queries.

---

## 1. What was compared

The reference paper [[1]](#ref1) compares eight architectures. All eight are implemented
here, plus this repository's two configurations, giving nine rows.

| # | Architecture | Origin | What it is |
|---|---|---|---|
| A1 | Standard RAG (lexical top-K) | paper, Arch. 1 | Chunk, index, retrieve top-*K* by term match |
| A2 | Dense-embedding RAG | paper, §V-E | Same pipeline, embeddings instead of terms |
| A3 | Hybrid lexical + dense (RRF) | vendor [[4]](#ref4)[[6]](#ref6) | Both retrievers over the same units, rank-fused |
| A4 | Deterministic GraphRAG, bespoke handlers | paper, Arch. 3 | Hand-written handlers dispatched by keyword |
| A5 | Agentic RAG (ReAct, retrieval tools) | paper, Arch. 5–6 | Iterative search → look up → expand, 6-step budget |
| A6 | Query planner, 9 traversal primitives | paper, Arch. 7 | Planner composes typed traversal operators |
| A7 | Adaptive planner, 15 operators | paper, Arch. 8 | Plus six graph-*computation* operators |
| A8 | Hybrid fused + graph expansion | this repo | Anchors + BM25 + dense → RRF → hop-decayed expansion → MMR |
| A9 | Hybrid retrieval + operator vocabulary | this repo | A8 for entry points and prose, A7's operators for structure |

The operator vocabulary is the paper's Tables XII and XIV, implemented in
[`modules/graph/services/primitives.ts`](./apps/api/src/modules/graph/services/primitives.ts)
and [`computation.ts`](./apps/api/src/modules/graph/services/computation.ts):

*Traversal (9):* `find_nodes`, `get_node`, `get_neighbors`, `shortest_path`, `subgraph`,
`count_edges`, `set_complement`, `filter_edges_by_date`, `propagate_risk`
*Computation (6):* `simulate_removal`, `subgraph_diff`, `aggregate_over_type`,
`betweenness`, `pagerank`, `connected_components`

---

## 2. The seven domains

An engine measured on the corpus it was designed against has proved nothing about itself.
So every architecture runs over seven graphs with genuinely different shapes, all read
through the same `DomainDataset` interface.

| Domain | Nodes | Edges | Types | Queries | Topology | What it is |
|---|---|---|---|---|---|---|
| `mediaops` | 68 | 108 | 6 | 12 | hierarchy | Render jobs, workers, error codes, runbooks — **native to this repo** |
| `aerospace` | 55 | 74 | 7 | 12 | chain | Risk events → suppliers → components → factories → aircraft → customers |
| `retail` | 58 | 97 | 9 | 12 | star | Sellers list products, customers order them, campaigns and complaints attach |
| `manufacturing` | 74 | 82 | 9 | 11 | deep hierarchy | Plants → lines → work orders → batches → defects, machines shared across lines |
| `logistics` | 41 | 76 | 6 | 12 | network | Hubs joined by lanes, carriers moving shipments, disruptions on hubs |
| `finance` | 45 | 85 | 5 | 12 | directed cyclic | Accounts, counterparties, transfers, monitoring alerts |
| `commerce` | 70 | 114 | 10 | 12 | mixed | Combined sales and manufacturing chain |

**Only `mediaops` is native.** Every other domain is hold-out for every architecture:
71 of 83 queries are on corpora nothing was tuned against.

Each domain contributes something the others cannot:

- **`aerospace`** is reconstructed from the paper's own published schema and ground-truth
  tables, so the comparison meets the source literature on its own topology. It reproduces
  the paper's headline findings — 15/15 components single-sourced, the 11/3/1 criticality
  split, exactly one customer outside the Thailand-flood blast radius. It is a
  reconstruction, not the paper's data file, which was not published; node and edge totals
  differ and a few of its aggregate figures do not reproduce exactly. Ground truth here is
  computed from *this* graph, so the benchmark stays self-consistent either way.
- **`retail`** is a star around orders — the shape where flat retrieval looks most
  plausible and is most dangerous, because every chunk is a real order and a confabulated
  total is fully cited.
- **`manufacturing`** is deep: a defect is four hops from the plant that owns it, which is
  the depth at which chunk retrieval stops being able to assemble an answer in principle.
- **`logistics`** is the only true *network*, so shortest paths, cut vertices and
  disconnected components are meaningful questions. Dubai is the sole crossing between the
  eastern and western halves; the Perth–Auckland feeder pair is connected to nothing.
- **`finance`** is the only domain whose interesting questions are about *global* structure
  rather than about paths from a named entity: where value concentrates, and which accounts
  form a closed group. Those are PageRank and connected components, and nothing else here
  exercises them.

Each domain also carries a temporal trap — an expired supplier contract, a campaign that
ended, a lane that opened late — because "what is true *now*" is the failure mode that
looks most like success in a text retriever.

---

## 3. Method, and what it does not measure

Following the paper's own scope note (§IV), this compares **retrieval architecture**, not
end-to-end answer quality. Every architecture produces a ranked entity set; no generation
happens, so nothing here is confounded by which language model wrote the prose.

**Scoring** keeps two numbers deliberately apart:

- **Verdict** — `correct` when every entity a right answer must be built from was
  surfaced *and* (for ranking questions) the right entity came first; `partial` when some
  were; `fail` when none were.
- **Entity F1** — the paper's headline metric, reported alongside and never averaged in.

Ground truth is computed **from the graph**, not hand-copied, and every answer key is
verified non-empty by a test — an answer key that has quietly gone empty would let the
benchmark keep reporting scores that mean nothing.

### Four limitations, stated plainly

1. **The planners are deterministic, not LLM-driven.** A6, A7 and A9 use an
   intent-to-operator planner rather than a live model. This removes tool-selection error,
   which makes those rows an **upper bound** on what an LLM planner achieves with the same
   vocabulary. What it isolates is exactly the variable under test — the operator
   vocabulary — with model quality held constant. The paper's own numbers put a real
   Claude Haiku 4.5 planner at F1 0.632 against its deterministic engine's 0.472, so the
   gap between oracle tool choice and model tool choice is real but not decisive.
2. **The dense baseline uses this repository's offline deterministic embedder**, not a
   trained sentence-transformer. Its absolute numbers are indicative. Its *direction* is
   not in question: the structural categories fail for reasons that have nothing to do
   with embedding quality, which is why the paper's own MiniLM baseline also failed all
   six of them [[1]](#ref1).
3. **The corpora are synthetic and small** — 41 to 74 nodes each. Large enough to separate
   architectures whose gaps are categorical, not large enough to say anything about
   retrieval at corpus scale.
4. **Individual rows contain noise.** With one query per category per domain, a single
   lucky ordering flips a verdict. Dense RAG scores `correct` on the logistics bottleneck
   query purely because it happened to return the right hub first out of six. Read the
   totals and the category matrix; do not read a single cell.

---

## 4. Headline results

83 queries, 12 intent categories, 7 domains.

| # | Architecture | Correct | Partial | Fail | Mean F1 | Recall | Orig. F1 | Hold-out F1 | Calls | ms |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Standard RAG (lexical top-K) | 22 | 19 | 42 | 0.252 | 0.367 | 0.361 | 0.233 | 0.0 | 0.15 |
| A2 | Dense-embedding RAG | 11 | 21 | 51 | 0.117 | 0.231 | 0.194 | 0.104 | 0.0 | 0.48 |
| A3 | Hybrid lexical + dense (RRF) | 13 | 23 | 47 | 0.157 | 0.285 | 0.293 | 0.134 | 0.0 | 0.27 |
| A4 | Deterministic GraphRAG (bespoke handlers) | 28 | 15 | 40 | 0.283 | 0.416 | **0.579** | **0.233** | 0.1 | 0.24 |
| A5 | Agentic RAG (ReAct, retrieval tools) | 43 | 15 | 25 | 0.239 | 0.616 | 0.272 | 0.233 | 5.4 | 0.14 |
| A6 | Query planner, 9 traversal primitives | 62 | 11 | 10 | 0.505 | 0.807 | 0.454 | 0.514 | 2.6 | 1.89 |
| A7 | Adaptive planner, 15 operators | 76 | 1 | 6 | **0.557** | 0.918 | 0.454 | **0.575** | 1.5 | 2.07 |
| A8 | Hybrid fused + graph expansion (this repo) | 25 | 24 | 34 | 0.278 | 0.431 | 0.267 | 0.279 | 0.0 | 1.69 |
| A9 | **Hybrid + operator vocabulary (this repo)** | **81** | **2** | **0** | 0.440 | **0.986** | 0.384 | 0.450 | 1.5 | 4.00 |

### Correct answers, domain by domain

| Architecture | mediaops | aerospace | retail | manufacturing | logistics | finance | commerce | Total |
|---|---|---|---|---|---|---|---|---|
| A1 Standard RAG | 4 | 2 | 3 | 3 | 4 | 4 | 2 | **22** |
| A2 Dense RAG | 1 | 3 | 1 | 1 | 1 | 3 | 1 | **11** |
| A3 Hybrid RRF | 3 | 2 | 1 | 2 | 1 | 3 | 1 | **13** |
| A4 Bespoke handlers | **10** | 2 | 3 | 3 | 4 | 4 | 2 | **28** |
| A5 Agentic RAG | 6 | 7 | 6 | 5 | 7 | 5 | 7 | **43** |
| A6 Traversal planner | 9 | 9 | 9 | 9 | 8 | 8 | 10 | **62** |
| A7 Adaptive planner | 11 | 10 | 11 | 10 | 11 | 12 | 11 | **76** |
| A8 Fused retrieval | 2 | 5 | 3 | 4 | 2 | 3 | 6 | **25** |
| **A9 Fused + operators** | **11** | **12** | **12** | **11** | **11** | **12** | **12** | **81** |

Read A4's row across. Ten of twelve on the domain it was built for — better than the
traversal planner there — and two, three, three, four, four, two everywhere else.

### Mean F1 by domain, and the spread

| Architecture | mediaops | aerospace | retail | manufacturing | logistics | finance | commerce | **Spread** |
|---|---|---|---|---|---|---|---|---|
| A1 Standard RAG | 0.361 | 0.183 | 0.216 | 0.263 | 0.357 | 0.203 | 0.179 | 0.182 |
| A2 Dense RAG | 0.194 | 0.131 | 0.093 | 0.103 | 0.057 | 0.185 | 0.054 | 0.139 |
| A3 Hybrid RRF | 0.293 | 0.107 | 0.093 | 0.126 | 0.199 | 0.185 | 0.090 | 0.202 |
| A4 Bespoke handlers | **0.579** | 0.183 | 0.216 | 0.263 | 0.357 | 0.203 | 0.179 | **0.399** |
| A5 Agentic RAG | 0.272 | 0.241 | 0.172 | 0.229 | 0.303 | 0.187 | 0.264 | 0.131 |
| A6 Traversal planner | 0.454 | 0.525 | 0.493 | 0.490 | 0.594 | 0.400 | 0.579 | 0.194 |
| A7 Adaptive planner | 0.454 | 0.540 | 0.529 | 0.500 | 0.685 | 0.565 | 0.624 | 0.231 |
| A8 Fused retrieval | 0.267 | 0.367 | 0.219 | 0.247 | 0.296 | 0.215 | 0.328 | 0.152 |
| **A9 Fused + operators** | 0.384 | 0.479 | 0.392 | 0.404 | 0.505 | 0.422 | 0.492 | **0.121** |

**Spread** — best domain minus worst — is the multi-domain measurement that a single-corpus
benchmark cannot produce. A large spread means the architecture depends on something about
a particular corpus rather than on a general capability. A4's 0.399 is more than three
times A9's 0.121, and A4's *peak* is the highest single cell in the table.

### Per-category verdicts

A category counts as handled only if **every** query in it, in every domain, is correct.

| Architecture | lookup | multi-hop | aggregation | inverse | absence | degree | comparison | temporal | what-if | propagation | prose | OOD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 Standard RAG | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ✗ | ✗ | ✗ | ~ | ✓ |
| A2 Dense RAG | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ✗ |
| A3 Hybrid RRF | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ✗ | ✗ | ✗ | ~ | ✗ |
| A4 Bespoke handlers | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ✗ | ✗ | ✗ | ~ | ✓ |
| A5 Agentic RAG | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ~ | ✓ | ✗ | ~ | ✓ |
| A6 Traversal planner | ✓ | ✓ | ~ | ✗ | ✗ | ~ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| A7 Adaptive planner | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| **A9 Fused + operators** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ |

`✓` correct · `~` partial · `✗` fail

Read the flat-retrieval rows across: **nine of twelve categories are a solid wall of
failure** for A1–A4, and the wall does not move between lexical, dense, fused and
hand-written handlers. Read the planner rows: the wall is gone, and what remains is prose
— the one thing the graph was never going to help with, and the one thing A9 keeps
retrieval for.

---

## 5. Query by query — four that decide it

Full results for all 83 queries are in [`ml/algorithm_comparison.md`](./ml/algorithm_comparison.md).

### 5.1 Degree — "which components have only one active supplier" (aerospace)

The paper's Q8, on its own topology. Ground truth: all fifteen.

| Architecture | Verdict | Recall | Returned | Calls |
|---|---|---|---|---|
| Standard RAG | FAIL | 0.00 | 6 | — |
| Dense RAG | FAIL | 0.00 | 6 | — |
| Hybrid RRF | FAIL | 0.00 | 6 | — |
| Bespoke handlers | FAIL | 0.00 | 6 | — |
| Agentic RAG (6 steps) | FAIL | 0.00 | 9 | 6 |
| Traversal planner | CORRECT | 1.00 | 15 | 6 |
| Adaptive planner | CORRECT | 1.00 | 15 | 6 |
| Fused retrieval | PARTIAL | 0.07 | 6 | — |
| **Fused + operators** | **CORRECT** | **1.00** | 20 | 6 |

Five architectures return zero of fifteen, and every one of them returns *something* — six
plausible components, confidently. The paper's ReAct baseline found 1 of 15 on this
question [[1]](#ref1); this one finds none, at six tool calls.

### 5.2 Aggregation — "which seller has the most returned or refunded orders" (retail)

| Architecture | Verdict | Recall | Returned | Calls |
|---|---|---|---|---|
| Standard RAG | PARTIAL | 0.25 | 6 | — |
| Dense RAG | FAIL | 0.00 | 6 | — |
| Hybrid RRF | FAIL | 0.00 | 6 | — |
| Bespoke handlers | PARTIAL | 0.25 | 6 | — |
| Agentic RAG (6 steps) | PARTIAL | 0.25 | 8 | 6 |
| Traversal planner | PARTIAL | 0.25 | 6 | 6 |
| Adaptive planner | CORRECT | 1.00 | 8 | **1** |
| Fused retrieval | FAIL | 0.00 | 6 | — |
| **Fused + operators** | **CORRECT** | **1.00** | 14 | **1** |

This is Neo4j's aggregation-failure mode [[6]](#ref6) at its most dangerous: every chunk
returned is a real order. A model handed those six would produce a confident, fully cited,
wrong total.

Note the call counts. The traversal-only planner spends **six** calls emulating an
aggregate by iterating and gets a quarter of the answer; the adaptive planner spends
**one** — `aggregate_over_type` — and gets all of it. That is the paper's Architecture
7 → 8 finding: the difference is not more reasoning, it is one operator that encapsulates a
complete algorithm rather than a step [[1]](#ref1).

### 5.3 Closed groups — "which accounts form a closed group with no link to the rest" (finance)

Ground truth: the three nominee accounts that transact only with each other.

| Architecture | Verdict | Recall | Calls |
|---|---|---|---|
| Standard RAG | FAIL | 0.00 | — |
| Dense RAG | FAIL | 0.00 | — |
| Hybrid RRF | FAIL | 0.00 | — |
| Bespoke handlers | FAIL | 0.00 | — |
| Agentic RAG (6 steps) | FAIL | 0.00 | 6 |
| Traversal planner | FAIL | 0.00 | 6 | 
| Adaptive planner | CORRECT | 1.00 | **1** |
| Fused retrieval | FAIL | 0.00 | — |
| **Fused + operators** | **CORRECT** | **1.00** | **1** |

Eight of nine architectures score zero, including the traversal planner. Isolation is
invisible to similarity search *by construction* — an isolated account matches the query
no worse than a connected one, and there is no amount of top-*K* that reveals an absence of
links. Only `connected_components` answers it.

### 5.4 Prose — "when is a shipment re-routed rather than held" (logistics)

The control in the other direction, and the one the planners lose: A6 and A7 both **fail**
prose questions outright in every domain, because there is no operator for "explain a
judgement call". A9 recovers them from its retrieval half, scoring partial.

This is why A9 keeps both halves rather than replacing retrieval with operators, and it is
the honest limit of this whole line of work.

---

## 6. What the numbers say

### 6.1 Better embeddings do not fix it — confirmed across seven domains

| | Correct / 83 | Mean F1 |
|---|---|---|
| Standard RAG (lexical) | 22 | 0.252 |
| Dense-embedding RAG | 11 | 0.117 |
| Hybrid lexical + dense | 13 | 0.157 |

Dense retrieval scored *worse* than lexical in six of seven domains — partly an artefact of
the offline embedder (§3), and partly the real effect the paper reports: dense similarity
smooths over exact identifiers like `CMP-001` and `SUP-004` that lexical matching nails.
Fusing the two recovers some of the loss and **fixes none of the nine failing categories**.

### 6.2 Agents help with traversal, not with computation

The ReAct baseline is the best non-graph architecture: 43 correct and recall 0.616, and it
is the only text-based row to handle lookup and what-if. Iterative retrieval does address
*incomplete context*.

It has no mechanism for guaranteed complete traversal. On aggregation, absence, inverse and
propagation it scores **zero across all seven domains**, at 5.4 tool calls per query — the
most expensive row in the table for the worst structural coverage. Compare the adaptive
planner at 1.5 calls and 76 correct. Better tools beat more steps, which is exactly what
the paper found when its planner used *fewer* calls (4.9 vs 5.3) and scored higher
[[1]](#ref1).

### 6.3 The co-design trap — the finding that needed seven domains to see

| Architecture | Native domain F1 | Hold-out F1 | Change | Spread |
|---|---|---|---|---|
| Deterministic GraphRAG (bespoke handlers) | 0.579 | 0.233 | **−60%** | **0.399** |
| Query planner, 9 traversal primitives | 0.454 | 0.514 | **+13%** | 0.194 |
| Adaptive planner, 15 operators | 0.454 | 0.575 | **+27%** | 0.231 |
| Hybrid + operator vocabulary (shipped) | 0.384 | 0.450 | **+17%** | **0.121** |

The handler architecture is *the best non-planner row on its own domain* — better there
than the traversal planner. Judged only on the corpus it was built for, you would ship it.
On six domains it has not seen it degrades to the level of plain lexical retrieval, because
nine hand-written keyword handlers match nothing and it falls through to top-*K*.

The paper found a 34% relative decline on hold-out queries *within* a single domain
[[1]](#ref1). Across domains it is nearly twice that. And the typed operators move in the
opposite direction — they score *higher* on unseen questions than on the ones they were
developed against, because an operator is a general capability and a handler is a memorised
answer.

> "The limiting factor in graph-augmented retrieval is not the LLM's reasoning capability
> but the operator vocabulary available to it." [[1]](#ref1)

Reproduced, seven times over.

### 6.4 Retrieval improvements alone do not cross the barrier

A8 — this repository's fused retrieval path, with RRF, graph expansion and MMR and no
operators — scores 25/83. Better than every flat baseline, and it still fails aggregation,
absence, inverse and propagation outright. Adding the operator vocabulary to the same
retrieval takes it from 25 to 81.

That is the case for building both. The retrieval half is what answers prose and what keeps
the abstention behaviour honest; the operator half is what crosses the structural barrier.
Neither is sufficient.

### 6.5 Where the paper's ordering did not reproduce

Two honest divergences.

**A6 vs A7 is narrower on F1 than the ordinal counts suggest.** Mean F1 moves 0.505 →
0.557 while correct answers move 62 → 76, because the traversal planner reaches partial
credit on most of what it cannot finish. The paper found the same thing and named it: its
headline F1 was flat (0.635 → 0.636) across the same architecture change while the
qualitative capability changed completely [[1]](#ref1).

**A9 does not beat A7 on F1** (0.440 vs 0.557) despite 81 correct to 76 and zero failures
to six. It unions retrieved context with operator output, so it returns more entities per
query, and precision-based F1 charges it for every one. Which is the next section.

---

## 7. The measurement gap

The paper warns that entity-level F1 underscores structural queries, and gives the case: a
correct aggregation answer scored F1 = 0.22 because ground truth listed 3 entity ids while
a comprehensive answer named 23 — every extra *correct* entity counted as a false positive
[[1]](#ref1).

It reproduces here, repeatedly. On the finance closed-group query the shipped configuration
is **correct** with recall 1.00 and F1 **0.50**. On the logistics bottleneck query it is
**correct** with recall 1.00 and F1 **0.13**. On the retail aggregation it is **correct**
with recall 1.00 and F1 **0.44**. In every case F1 is punishing it for returning the
supporting evidence alongside the answer.

The generated report lists every such disagreement under *The measurement gap*. The
practical rule this produced:

> **Do not score structural queries with a flat entity-overlap metric.** Aggregation needs
> ranking accuracy, complement needs set correctness, what-if needs causal coverage. A
> single F1 column will reliably punish the improvement you just built.

That is why the benchmark reports verdict and F1 side by side and never averages them.

---

## 8. What was changed in this codebase

The comparison drove the implementation. Before this work the retrieval layer had two
mutually exclusive paths — dense vectors over runbook prose, or BM25 over job and
error-code records — and the two indexes covered *disjoint* content.

| Gap | Fix | Where |
|---|---|---|
| Runbook prose was not keyword-searchable at all | One unit set indexed by both retrievers | [`hybrid.ts`](./apps/api/src/modules/retrieval/services/hybrid.ts) |
| Records and prose were disconnected islands | Typed graph over the existing rows, no LLM extraction | [`modules/graph/`](./apps/api/src/modules/graph/) |
| The two paths competed instead of combining | Reciprocal Rank Fusion + MMR diversification | [`fusion.ts`](./apps/api/src/modules/retrieval/services/fusion.ts) |
| No aggregation, complement, comparison or temporal answers | 15 typed operators, exposed as agent tools | [`primitives.ts`](./apps/api/src/modules/graph/services/primitives.ts), [`computation.ts`](./apps/api/src/modules/graph/services/computation.ts) |
| Structural questions routed by coin flip | Deterministic pin on structural and anchored-procedural shapes | [`routing/services/rules.ts`](./apps/api/src/modules/routing/services/rules.ts) |
| The golden set could not see the failure class | 10 structural cases, incl. 2 structural-shaped out-of-domain traps | [`eval/goldenSet.ts`](./apps/api/src/eval/goldenSet.ts) |
| Nothing proved the engine was not shaped around one corpus | Six additional domains behind one interface | [`domains/`](./apps/api/src/modules/graph/services/domains/) |

Deliberately **not** built, on the evidence: community detection and summarisation
(Microsoft's clustering [[3]](#ref3) earns its cost on large narrative corpora, not on
13 KB of runbooks), a graph database (traversal here is sub-millisecond in memory),
LLM entity extraction (the entities are already typed rows; LightRAG's far richer extracted
graph — 244 entities to the reference implementation's 48 — still failed the structural
queries [[1]](#ref1)), and text-to-Cypher (typed operators have no generated-query
injection surface and no syntax failures).

### What the extra domains changed about the engine itself

Adding six corpora was not just measurement — it exposed six defects that a single corpus
had hidden, and each fix is a capability the engine did not have:

- **Centrality answered the wrong question.** Betweenness ran over the whole graph, so a
  shipment touching two hubs created a shortcut past the only real crossing. It now runs on
  the subgraph induced by the type asked about.
- **Aggregation defaulted to one hop.** Where the target sat three edges away, the count
  came back empty — which reads exactly like a correct "none". Hop count is now derived
  from the schema.
- **Descriptive words were resolved as entity names.** An alert titled "Circular transfers
  between nominees" was matched as *the* entity for any question mentioning transfers.
  Words that name a node type are now excluded from identifier matching.
- **Multi-word type names were invisible.** "Risk event" and "work order" matched nothing,
  so the planner had no idea what the question was counting.
- **Complement had no way to express "no Y".** The related type is now taken from the types
  the question names, not from loose term overlap.
- **`connected_components` could only report the largest group**, which is the opposite of
  what anyone asks. It now reports the isolated ones too.

### Effect on the existing golden set

The abstention behaviour was most at risk — graph expansion is exactly how a weak
accidental match becomes a plausible pile of evidence. It is guarded by expanding *only*
from seeds that already cleared an admission floor, with floors unchanged from the two
single-path retrievers.

| | Before | After |
|---|---|---|
| Golden cases | 40 | 50 (+10 structural) |
| Routing accuracy | 100.0% (28 labelled) | 100.0% (36 labelled) |
| False answers | 3 of 12 abstain cases (25.0%) | 3 of 14 abstain cases (21.4%) |
| Abstention F1 | 81.8% | 84.6% |
| Citation validity | 100.0% | 100.0% |
| Benchmark | 24 queries, 2 domains | 83 queries, 7 domains |
| Test suite | 153 passing | 234 passing |

The same three cases fail to abstain as before; ten harder cases were added and none broke
it. Every out-of-domain query in all seven benchmark domains is answered by abstaining.

One result worth keeping: **"Always fused" produced five false answers to the routed
system's three.** Routing still earns its place. Sending everything down the most capable
path is not the same as sending each question down the right one.

---

## 9. What to take from this

1. **Curate an operator vocabulary, not a handler library.** Every hand-written handler is
   a memorised answer that will not survive contact with a question you did not anticipate
   — or a corpus you did not design for.
2. **Computation operators are not optional extras.** The gap between nine traversal
   primitives and fifteen operators is the gap between iterating until the budget runs out
   and answering in one call. Aggregation, absence, inverse and closed-group detection all
   live in that gap.
3. **Keep the fused retrieval anyway.** Operators cannot answer "when is a shipment
   re-routed rather than held". Prose questions are a real share of real traffic.
4. **Guard abstention explicitly when you add expansion.** Expand only from seeds that
   cleared a floor, and re-run the out-of-domain cases specifically. It is the easiest
   thing in this design to break silently.
5. **Measure with the right metric or you will punish your own improvement.** Verdict and
   F1, side by side, never averaged.
6. **Test on domains you did not design for — plural.** The two most informative numbers
   here, the 60% hold-out collapse and the 0.399 spread, are both invisible on the original
   corpus. Six of the engine's own defects were invisible too.

---

## References

<a id="ref1"></a>**[1] Grama Chethan, "Beyond Vector Similarity: A Structural Analysis of
Graph-Augmented Retrieval for Industrial Knowledge Graphs."** arXiv:2606.06003v1 [cs.AI],
4 June 2026 (v3.0). Siemens Digital Industries Software, AI & Analytics.
Local copy: `C:\Users\Sanjeev\Downloads\2606.06003v1.pdf`
The backbone of this comparison. Eight architectures over a 46-node, 64-edge aerospace
supply-chain graph, 23 queries in 10 intent categories. Contributes: the definition of
structurally unreachable queries (§III); the six-mode failure taxonomy (Table VII); the
finding that dense embeddings do not cross the structural barrier (§V-E); the
operator-vocabulary thesis and the typed-primitive libraries (Tables XII, XIV, XVI);
hop-decay propagation (Eq. 1); the co-design/hold-out collapse (Table XIII); the
measurement-gap warning on entity-level F1 (§VII-D); and, via Tables II, III and XVIII, the
schema and ground truths the `aerospace` domain here is reconstructed from.

<a id="ref2"></a>**[2] Microsoft Research — GraphRAG project page.**
https://www.microsoft.com/en-us/research/project/graphrag/
Contributes: the two baseline-RAG failure modes ("connecting the dots" across disparate
information, and holistic understanding of a whole corpus); the finding that GraphRAG
faithfulness is *comparable to*, not better than, baseline RAG — which is why the grounding
gate here was extended rather than relaxed; VeriTrail for provenance tracing.

<a id="ref3"></a>**[3] Microsoft GraphRAG — Indexing Architecture.**
https://microsoft.github.io/graphrag/index/architecture/
Contributes: the six-stage indexing pipeline and hierarchical community summarisation —
evaluated and deliberately not adopted at this corpus size (§8). Query modes (Local,
Global, DRIFT, Basic) from https://microsoft.github.io/graphrag/query/overview/.

<a id="ref4"></a>**[4] AWS Database Blog — "Improving generative AI accuracy with vector
and graph search hybrid queries."**
https://aws.amazon.com/blogs/database/improving-generative-ai-accuracy-with-vector-and-graph-search-hybrid-queries/
Contributes: "Vector search excels at finding what is semantically similar, but it cannot
reveal what is structurally connected"; the vector-first-then-graph composition order that
A8 implements.

<a id="ref5"></a>**[5] Google Cloud Architecture Center — "GraphRAG with Spanner Graph."**
https://docs.cloud.google.com/architecture/gen-ai-graphrag-spanner
Contributes: co-locating the graph and the embeddings in one store, so a vector hit and a
graph node are the same object — implemented here by indexing graph nodes directly as
retrieval units; and the explicit re-ranking stage after fusion.

<a id="ref6"></a>**[6] Neo4j Developer Blog — RAG tutorial (vector + graph hybrid retrieval).**
https://neo4j.com/blog/developer/rag-tutorial/
Contributes: the aggregation-failure mode — top-*k* causes the model to confabulate a total
from how many chunks it happened to receive, reproduced verbatim in §5.2; the
explainability argument that vector-only retrieval cannot say *why* a document was
retrieved, which is why every traversal-reached citation here carries its hop path.

### Generated artefacts

- [`ml/algorithm_comparison.md`](./ml/algorithm_comparison.md) — full per-query results for
  all 83 queries × 9 architectures across 7 domains.
  Regenerate: `npm run eval:architectures --workspace=apps/api`
- [`ml/eval_report.md`](./ml/eval_report.md) — golden-set strategy comparison, 50 cases.
  Regenerate: `npm run eval` (needs Postgres)
- [`SEARCH_ENGINE.md`](./SEARCH_ENGINE.md) — the reading of the sources that preceded this
