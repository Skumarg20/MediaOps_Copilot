# Retrieval architecture comparison — generated results

Generated 2026-08-25T18:05:06.138Z by `src/eval/runArchitectures.ts`. Deterministic; the graph is read from Neo4j (no model runtime, no API keys). Sync it first with npm run graph:sync. Re-run with `npm run eval:architectures --workspace=apps/api`.

**Scope.** This compares *retrieval architecture*, not end-to-end answer quality. Each row produces an entity set; no generation happens, so nothing here is confounded by which language model wrote the prose. The planner rows use a deterministic intent-to-operator planner rather than a live LLM, which removes tool-selection error and makes them an **upper bound** on what an LLM planner would achieve with the same vocabulary.

## Corpora

| Domain | Nodes | Edges | Types | Queries | What it is |
|---|---|---|---|---|---|
| mediaops | 68 | 108 | 6 | 12 | Render operations: jobs fail with error codes on workers, and runbooks document how to handle them. |
| aerospace | 55 | 74 | 7 | 12 | Aerospace supply chain, reconstructed from the reference paper: risk events -> suppliers -> components -> factories -> aircraft -> customers. |
| retail | 58 | 97 | 9 | 12 | Product sales: sellers list products, customers order them, campaigns run for a window, complaints attach to products. |
| manufacturing | 74 | 82 | 9 | 11 | Plant floor: plants own lines, machines sit on lines, work orders produce batches, defects are found in batches. |
| logistics | 41 | 76 | 6 | 12 | Freight network: hubs joined by lanes, carriers moving shipments to consignees, disruptions raised against hubs. |
| finance | 45 | 85 | 5 | 12 | Payments monitoring: accounts at institutions, transfers between accounts, alerts raised against accounts. |
| commerce | 70 | 114 | 10 | 12 | Combined sales and manufacturing chain — the first non-native domain this engine was tested on. |

Only `mediaops` is native to this repository, and it is the one the bespoke handlers were written for. **Every other domain is hold-out for every architecture** — nothing was tuned against them, and each has a different topology: a supply chain, a sales star, a deep production hierarchy, a routing network and a directed payments network.

## Correct answers by domain

The headline of the multi-domain run: does an architecture hold up when the schema changes?

| Architecture | mediaops (12) | aerospace (12) | retail (12) | manufacturing (11) | logistics (12) | finance (12) | commerce (12) | Total |
|---|---|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | 4 | 2 | 3 | 3 | 4 | 4 | 2 | **22** |
| Dense-embedding RAG | 1 | 3 | 1 | 1 | 1 | 3 | 1 | **11** |
| Hybrid lexical + dense (RRF) | 3 | 2 | 1 | 2 | 1 | 3 | 1 | **13** |
| Deterministic GraphRAG (bespoke handlers) | 10 | 2 | 3 | 3 | 4 | 4 | 2 | **28** |
| Agentic RAG (ReAct, retrieval tools) | 6 | 7 | 6 | 5 | 6 | 5 | 7 | **42** |
| Query planner, 9 traversal primitives | 9 | 9 | 9 | 9 | 8 | 8 | 10 | **62** |
| Adaptive planner, 15 operators | 11 | 10 | 11 | 10 | 11 | 12 | 11 | **76** |
| Hybrid fused + graph expansion (this repo, retrieval only) | 2 | 5 | 3 | 4 | 2 | 3 | 6 | **25** |
| Hybrid retrieval + operator vocabulary (this repo, production) | 11 | 12 | 12 | 11 | 11 | 12 | 12 | **81** |

### Mean F1 by domain

| Architecture | mediaops | aerospace | retail | manufacturing | logistics | finance | commerce | Spread |
|---|---|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | 0.361 | 0.183 | 0.216 | 0.263 | 0.357 | 0.203 | 0.179 | 0.182 |
| Dense-embedding RAG | 0.194 | 0.131 | 0.093 | 0.103 | 0.057 | 0.185 | 0.054 | 0.139 |
| Hybrid lexical + dense (RRF) | 0.293 | 0.107 | 0.093 | 0.126 | 0.199 | 0.185 | 0.090 | 0.202 |
| Deterministic GraphRAG (bespoke handlers) | 0.531 | 0.183 | 0.216 | 0.263 | 0.357 | 0.203 | 0.179 | 0.351 |
| Agentic RAG (ReAct, retrieval tools) | 0.268 | 0.241 | 0.177 | 0.229 | 0.304 | 0.182 | 0.271 | 0.127 |
| Query planner, 9 traversal primitives | 0.454 | 0.525 | 0.493 | 0.490 | 0.594 | 0.400 | 0.579 | 0.194 |
| Adaptive planner, 15 operators | 0.454 | 0.540 | 0.529 | 0.500 | 0.685 | 0.565 | 0.624 | 0.231 |
| Hybrid fused + graph expansion (this repo, retrieval only) | 0.267 | 0.367 | 0.219 | 0.247 | 0.296 | 0.215 | 0.328 | 0.152 |
| Hybrid retrieval + operator vocabulary (this repo, production) | 0.384 | 0.479 | 0.392 | 0.404 | 0.505 | 0.422 | 0.492 | 0.121 |

**Spread** is the gap between an architecture's best and worst domain. A large spread means the architecture depends on something about a particular corpus rather than on a general capability.

## Headline

| # | Architecture | Origin | Correct | Partial | Fail | Mean F1 | Mean recall | Orig. F1 | Hold-out F1 | Calls | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Standard RAG (lexical top-K) | paper | 22 | 19 | 42 | 0.252 | 0.367 | 0.361 | 0.233 | 0.0 | 0.149 |
| A2 | Dense-embedding RAG | paper | 11 | 21 | 51 | 0.117 | 0.231 | 0.194 | 0.104 | 0.0 | 0.515 |
| A3 | Hybrid lexical + dense (RRF) | vendor | 13 | 23 | 47 | 0.157 | 0.285 | 0.293 | 0.134 | 0.0 | 0.328 |
| A4 | Deterministic GraphRAG (bespoke handlers) | paper | 28 | 15 | 40 | 0.276 | 0.416 | 0.531 | 0.233 | 0.1 | 5.266 |
| A5 | Agentic RAG (ReAct, retrieval tools) | paper | 42 | 16 | 25 | 0.239 | 0.613 | 0.268 | 0.234 | 5.4 | 34.847 |
| A6 | Query planner, 9 traversal primitives | paper | 62 | 11 | 10 | 0.505 | 0.807 | 0.454 | 0.514 | 2.6 | 37.506 |
| A7 | Adaptive planner, 15 operators | paper | 76 | 1 | 6 | 0.557 | 0.918 | 0.454 | 0.575 | 1.5 | 55.978 |
| A8 | Hybrid fused + graph expansion (this repo, retrieval only) | this repo | 25 | 24 | 34 | 0.278 | 0.431 | 0.267 | 0.279 | 0.0 | 87.495 |
| A9 | Hybrid retrieval + operator vocabulary (this repo, production) | this repo | 81 | 2 | 0 | 0.440 | 0.986 | 0.384 | 0.450 | 1.5 | 87.123 |

Total queries: 83 (12 original, 71 hold-out).

## Per-category verdicts

A category counts as handled only if **every** query in it is correct — worst verdict wins.

| Architecture | lookup | multi_hop | aggregation | inverse | absence | degree | comparison | temporal | what_if | propagation | prose | out_of_domain |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | partial | fail | fail | fail | fail | fail | partial | fail | fail | fail | partial | correct |
| Dense-embedding RAG | fail | fail | fail | fail | fail | fail | fail | fail | fail | fail | partial | fail |
| Hybrid lexical + dense (RRF) | fail | fail | fail | fail | fail | fail | partial | fail | fail | fail | partial | fail |
| Deterministic GraphRAG (bespoke handlers) | partial | fail | fail | fail | fail | fail | partial | fail | fail | fail | partial | correct |
| Agentic RAG (ReAct, retrieval tools) | correct | fail | fail | fail | fail | fail | partial | partial | correct | fail | partial | correct |
| Query planner, 9 traversal primitives | correct | correct | partial | fail | fail | partial | correct | correct | correct | correct | fail | correct |
| Adaptive planner, 15 operators | correct | correct | partial | correct | correct | correct | correct | correct | correct | correct | fail | correct |
| Hybrid fused + graph expansion (this repo, retrieval only) | partial | fail | fail | fail | fail | fail | partial | fail | fail | fail | partial | correct |
| Hybrid retrieval + operator vocabulary (this repo, production) | correct | correct | correct | correct | correct | correct | correct | correct | correct | correct | partial | correct |

## Query by query

### M1 — lookup — mediaops

**Query:** `what does error code RENDER_TIMEOUT mean`

**Why it is here:** The locally contained case. Flat retrieval should get this right; it is the control.

**Ground truth (1 entity):** errorCode:RENDER_TIMEOUT

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.13 | 14 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.33 | 5 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.33 | 5 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.25 | 7 | (nothing) | 2 |

### M2 — multi_hop — mediaops

**Query:** `how do I fix job 482`

**Why it is here:** Record, code and runbook. Pinning to record lookup returns the first two and never reads the third.

**Ground truth (4 entities):** job:482, errorCode:RENDER_TIMEOUT, runbook-job-lifecycle#c2, runbook-timeouts-and-retries#c4

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.25 | 0.20 | 6 | errorCode:RENDER_TIMEOUT, runbook-job-lifecycle#c2, runbook-timeouts-and-retries#c4 | — |
| Dense-embedding RAG | PARTIAL | 0.25 | 0.20 | 6 | job:482, runbook-job-lifecycle#c2, runbook-timeouts-and-retries#c4 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.25 | 0.20 | 6 | errorCode:RENDER_TIMEOUT, runbook-job-lifecycle#c2, runbook-timeouts-and-retries#c4 | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.53 | 11 | (nothing) | 1 |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.31 | 22 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.30 | 23 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.30 | 23 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.75 | 0.60 | 6 | runbook-timeouts-and-retries#c4 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.30 | 23 | (nothing) | 1 |

### M3 — aggregation — mediaops

**Query:** `which worker is causing the most failures`

**Why it is here:** A count over every job grouped by worker. top-K cannot count; it can only sample.

**Ground truth (4 entities):** worker:worker-07, job:482, job:483, job:491

**Must rank first:** `worker:worker-07`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | worker:worker-07, job:482, job:483, job:491 | — |
| Dense-embedding RAG | PARTIAL | 0.25 | 0.20 | 6 | job:482, job:483, job:491 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.25 | 0.20 | 6 | job:482, job:483, job:491 | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.50 | 12 | (nothing) | 1 |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 13 | worker:worker-07, job:482, job:483, job:491 | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.25 | 0.20 | 6 | job:482, job:483, job:491 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.50 | 12 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | worker:worker-07, job:482, job:483, job:491 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.40 | 16 | (nothing) | 1 |

### M4 — inverse — mediaops

**Query:** `which other jobs failed for the same reason as job 482`

**Why it is here:** Job to code and back out to every other job. The one hop the record path had was one-way.

**Ground truth (2 entities):** job:482, job:483

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Dense-embedding RAG | PARTIAL | 0.50 | 0.25 | 6 | job:483 | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 2 | (nothing) | 1 |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.21 | 17 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.31 | 11 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.31 | 11 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.25 | 6 | job:483 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.31 | 11 | (nothing) | 1 |

### M5 — absence — mediaops

**Query:** `which error codes have no runbook coverage`

**Why it is here:** A set complement. Similarity search can only return codes that DO match something.

**Ground truth (4 entities):** errorCode:ASSET_UNSUPPORTED_CODEC, errorCode:FONT_MISSING, errorCode:RENDER_STALLED, errorCode:WORKER_EVICTED

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.50 | 0.40 | 6 | errorCode:RENDER_STALLED, errorCode:WORKER_EVICTED | — |
| Dense-embedding RAG | PARTIAL | 0.50 | 0.40 | 6 | errorCode:RENDER_STALLED, errorCode:WORKER_EVICTED | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.50 | 0.40 | 6 | errorCode:RENDER_STALLED, errorCode:WORKER_EVICTED | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.42 | 15 | (nothing) | 2 |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.50 | 0.27 | 11 | errorCode:RENDER_STALLED, errorCode:WORKER_EVICTED | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.75 | 0.60 | 6 | errorCode:WORKER_EVICTED | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.42 | 15 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 3 | errorCode:ASSET_UNSUPPORTED_CODEC, errorCode:FONT_MISSING, errorCode:RENDER_STALLED, errorCode:WORKER_EVICTED | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.36 | 18 | (nothing) | 2 |

### M6 — degree — mediaops

**Query:** `which workers have failed exactly one job`

**Why it is here:** In-degree counting on FAILED_WITH, filtered. The SPOF shape from the paper, in this domain.

**Ground truth (4 entities):** worker:worker-03, worker:worker-04, worker:worker-06, worker:worker-09

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | worker:worker-03, worker:worker-04, worker:worker-06, worker:worker-09 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | worker:worker-03, worker:worker-04, worker:worker-06, worker:worker-09 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | worker:worker-03, worker:worker-04, worker:worker-06, worker:worker-09 | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.50 | 12 | (nothing) | 1 |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 12 | worker:worker-03, worker:worker-04, worker:worker-06, worker:worker-09 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 6 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | worker:worker-03, worker:worker-04, worker:worker-06, worker:worker-09 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.44 | 14 | (nothing) | 6 |

### M7 — comparison — mediaops

**Query:** `is job 482 the same problem as job 487`

**Why it is here:** Two subgraphs enumerated and compared. No chunk contains a comparison.

**Ground truth (4 entities):** job:482, job:487, errorCode:RENDER_TIMEOUT, errorCode:UPLOAD_TIMEOUT

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.75 | 0.60 | 6 | errorCode:UPLOAD_TIMEOUT | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | job:482, job:487, errorCode:RENDER_TIMEOUT, errorCode:UPLOAD_TIMEOUT | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.25 | 0.20 | 6 | job:487, errorCode:RENDER_TIMEOUT, errorCode:UPLOAD_TIMEOUT | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.30 | 23 | (nothing) | 1 |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.35 | 19 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.30 | 23 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.17 | 42 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.40 | 6 | job:487, errorCode:UPLOAD_TIMEOUT | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.17 | 42 | (nothing) | 1 |

### M8 — temporal — mediaops

**Query:** `which jobs were queued after 11:00 on 2026-08-18`

**Why it is here:** Timestamps exist on the records but nothing was time-filterable before the graph.

**Ground truth (7 entities):** job:487, job:488, job:489, job:490, job:491, job:492, job:493

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.43 | 0.46 | 6 | job:487, job:489, job:491, job:493 | — |
| Dense-embedding RAG | PARTIAL | 0.71 | 0.77 | 6 | job:487, job:489 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.57 | 0.62 | 6 | job:487, job:489, job:493 | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.61 | 16 | (nothing) | 1 |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.57 | 0.36 | 15 | job:487, job:489, job:493 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.35 | 33 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.35 | 33 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | job:487, job:488, job:489, job:490, +3 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.35 | 33 | (nothing) | 1 |

### M9 — what_if — mediaops

**Query:** `if worker-07 is drained which jobs lose their only worker`

**Why it is here:** Counterfactual. Defined by what is absent from the graph after a hypothetical edit.

**Ground truth (3 entities):** job:482, job:483, job:491

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | job:482, job:483, job:491 | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 3 | (nothing) | 1 |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.38 | 13 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 3 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 3 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.67 | 0.44 | 6 | job:483 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.60 | 7 | (nothing) | 1 |

### M10 — propagation — mediaops

**Query:** `rank workers by exposure to high severity failures`

**Why it is here:** Weighted multi-hop scoring. The score exists nowhere in any text.

**Ground truth (1 entity):** worker:worker-07

**Must rank first:** `worker:worker-07`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | worker:worker-07 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | worker:worker-07 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | worker:worker-07 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 0 | worker:worker-07 | 1 |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 16 | worker:worker-07 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.40 | 4 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.40 | 4 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | worker:worker-07 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.20 | 9 | (nothing) | 1 |

### M11 — prose — mediaops

**Query:** `when should I drain a worker instead of retrying`

**Why it is here:** Genuinely a prose question. Included so the comparison shows what the graph does NOT help with.

**Ground truth (3 entities):** runbook-escalation-and-oncall#c3, runbook-performance-degradation#c2, runbook-timeouts-and-retries#c4

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.33 | 0.22 | 6 | runbook-escalation-and-oncall#c3, runbook-timeouts-and-retries#c4 | — |
| Dense-embedding RAG | PARTIAL | 0.33 | 0.22 | 6 | runbook-escalation-and-oncall#c3, runbook-performance-degradation#c2 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.67 | 0.44 | 6 | runbook-escalation-and-oncall#c3 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.33 | 0.22 | 6 | runbook-escalation-and-oncall#c3, runbook-timeouts-and-retries#c4 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.67 | 0.21 | 16 | runbook-escalation-and-oncall#c3 | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 0 | runbook-escalation-and-oncall#c3, runbook-performance-degradation#c2, runbook-timeouts-and-retries#c4 | — |
| Adaptive planner, 15 operators | FAIL | 0.00 | 0.00 | 0 | runbook-escalation-and-oncall#c3, runbook-performance-degradation#c2, runbook-timeouts-and-retries#c4 | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.33 | 0.22 | 6 | runbook-escalation-and-oncall#c3, runbook-performance-degradation#c2 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | PARTIAL | 0.33 | 0.22 | 6 | runbook-escalation-and-oncall#c3, runbook-performance-degradation#c2 | — |

### M12 — out_of_domain — mediaops

**Query:** `what is the capital of France`

**Why it is here:** The abstention guard. Graph expansion must not turn one weak accidental match into evidence.

**Correct behaviour:** retrieve nothing and abstain.

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | — | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | — | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 1.00 | 0 | — | 1 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 1.00 | 0 | — | — |

### C1 — lookup — commerce (hold-out)

**Query:** `what does supplier SUP-04 supply`

**Why it is here:** Control case in the second domain.

**Ground truth (3 entities):** supplier:SUP-04, component:CMP-03, component:CMP-08

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.33 | 0.22 | 6 | component:CMP-03, component:CMP-08 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-04, component:CMP-03, component:CMP-08 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-04, component:CMP-03, component:CMP-08 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.33 | 0.22 | 6 | component:CMP-03, component:CMP-08 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.40 | 12 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.86 | 4 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.86 | 4 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | 2 |

### C2 — degree — commerce (hold-out)

**Query:** `which components have only one active supplier`

**Why it is here:** In-degree centrality on SUPPLIES across the whole graph — the canonical SPOF query.

**Ground truth (6 entities):** component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-05, component:CMP-06, component:CMP-10

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-05, +2 more | — |
| Dense-embedding RAG | PARTIAL | 0.17 | 0.17 | 6 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-05, +1 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-05, +2 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-05, +2 more | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.33 | 0.22 | 12 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-05 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.75 | 10 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.75 | 10 | (nothing) | 6 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-05, +2 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.55 | 16 | (nothing) | 6 |

### C3 — temporal — commerce (hold-out)

**Query:** `who supplies the SoC processor now`

**Why it is here:** The expired contract is still in the prose. Text retrieval returns both suppliers with no way to choose.

**Ground truth (1 entity):** supplier:SUP-04

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 2 | supplier:SUP-04 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-04 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-04 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 2 | supplier:SUP-04 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.12 | 16 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.50 | 3 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.50 | 3 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | 1 |

### C4 — aggregation — commerce (hold-out)

**Query:** `which seller has the most returned or refunded orders`

**Why it is here:** Sales aggregation. Neo4j calls this the most dangerous RAG failure: the model confabulates the total from how many chunks it received.

**Ground truth (4 entities):** seller:SEL-05, sale:SALE-1008, sale:SALE-1009, sale:SALE-1010

**Must rank first:** `seller:SEL-05`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.25 | 0.20 | 6 | seller:SEL-05, sale:SALE-1008, sale:SALE-1009 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | seller:SEL-05, sale:SALE-1008, sale:SALE-1009, sale:SALE-1010 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.25 | 0.20 | 6 | seller:SEL-05, sale:SALE-1009, sale:SALE-1010 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.25 | 0.20 | 6 | seller:SEL-05, sale:SALE-1008, sale:SALE-1009 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.25 | 0.17 | 8 | seller:SEL-05, sale:SALE-1008, sale:SALE-1009 | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.25 | 0.22 | 5 | sale:SALE-1008, sale:SALE-1009, sale:SALE-1010 | 5 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | seller:SEL-05, sale:SALE-1008, sale:SALE-1009, sale:SALE-1010 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.44 | 14 | (nothing) | 1 |

### C5 — multi_hop — commerce (hold-out)

**Query:** `which products are exposed to the Shenzhen port closure`

**Why it is here:** Four hops: incident to supplier to component to factory to product.

**Ground truth (4 entities):** product:PRD-01, product:PRD-02, product:PRD-04, product:PRD-06

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 4 | product:PRD-01, product:PRD-02, product:PRD-04, product:PRD-06 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | product:PRD-01, product:PRD-02, product:PRD-04, product:PRD-06 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | product:PRD-01, product:PRD-02, product:PRD-04, product:PRD-06 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 4 | product:PRD-01, product:PRD-02, product:PRD-04, product:PRD-06 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.50 | 0.25 | 12 | product:PRD-01, product:PRD-02 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.42 | 15 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.42 | 15 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 4 | product:PRD-01, product:PRD-02, product:PRD-04, product:PRD-06 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.42 | 15 | (nothing) | 1 |

### C6 — inverse — commerce (hold-out)

**Query:** `which sellers are not exposed to the Shenzhen port closure`

**Why it is here:** Blast radius, then its complement. Two operations neither of which is a similarity search.

**Ground truth (1 entity):** seller:SEL-04

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 3 | seller:SEL-04 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | seller:SEL-04 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | seller:SEL-04 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 3 | seller:SEL-04 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 11 | seller:SEL-04 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.33 | 5 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.33 | 5 | (nothing) | 6 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 4 | seller:SEL-04 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.20 | 9 | (nothing) | 6 |

### C7 — comparison — commerce (hold-out)

**Query:** `compare the supply chain of AuraPhone X and HomeHub Mini`

**Why it is here:** Dual upstream traversal with parallel metrics.

**Ground truth (4 entities):** product:PRD-01, product:PRD-05, factory:FAC-01, factory:FAC-04

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.50 | 0.44 | 5 | factory:FAC-01, factory:FAC-04 | — |
| Dense-embedding RAG | PARTIAL | 0.25 | 0.20 | 6 | product:PRD-01, product:PRD-05, factory:FAC-01 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.75 | 0.60 | 6 | factory:FAC-01 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.50 | 0.44 | 5 | factory:FAC-01, factory:FAC-04 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.30 | 23 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.26 | 27 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.16 | 46 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.40 | 6 | product:PRD-05, factory:FAC-04 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.16 | 46 | (nothing) | 1 |

### C8 — what_if — commerce (hold-out)

**Query:** `if AudioTek is dropped which components lose their only supplier`

**Why it is here:** Counterfactual removal over a real dual-sourcing policy.

**Ground truth (2 entities):** component:CMP-06, component:CMP-10

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | component:CMP-06, component:CMP-10 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | component:CMP-06, component:CMP-10 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | component:CMP-06, component:CMP-10 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | component:CMP-06, component:CMP-10 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.25 | 14 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.80 | 3 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 2 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | 1 |

### C9 — propagation — commerce (hold-out)

**Query:** `rank products by exposure to active incidents`

**Why it is here:** Severity-weighted hop-decay scoring over every product. Equation 1 of the paper, on sales data.

**Ground truth (6 entities):** product:PRD-01, product:PRD-02, product:PRD-03, product:PRD-04, product:PRD-05, product:PRD-06

**Must rank first:** `product:PRD-01`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | product:PRD-01, product:PRD-02, product:PRD-03, product:PRD-04, +2 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | product:PRD-01, product:PRD-02, product:PRD-03, product:PRD-04, +2 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | product:PRD-01, product:PRD-02, product:PRD-03, product:PRD-04, +2 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | product:PRD-01, product:PRD-02, product:PRD-03, product:PRD-04, +2 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 9 | product:PRD-01, product:PRD-02, product:PRD-03, product:PRD-04, +2 more | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 6 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 6 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | product:PRD-01, product:PRD-02, product:PRD-03, product:PRD-04, +2 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.67 | 12 | (nothing) | 1 |

### C10 — aggregation — commerce (hold-out)

**Query:** `how many components does Chennai Assembly depend on`

**Why it is here:** A bounded count. The answer is a number, and a top-K retriever has no way to know it stopped early.

**Ground truth (4 entities):** component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-04

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 3 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-04 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-04 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-04 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 3 | component:CMP-01, component:CMP-02, component:CMP-03, component:CMP-04 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.42 | 15 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.80 | 6 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.80 | 6 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.80 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.73 | 7 | (nothing) | 1 |

### C11 — prose — commerce (hold-out)

**Query:** `when is a seller put into commercial review`

**Why it is here:** Genuinely a prose question in the second domain.

**Ground truth (1 entity):** policy-returns#c1

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.13 | 15 | (nothing) | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 0 | policy-returns#c1 | — |
| Adaptive planner, 15 operators | FAIL | 0.00 | 0.00 | 0 | policy-returns#c1 | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |

### C12 — out_of_domain — commerce (hold-out)

**Query:** `what is the boiling point of mercury`

**Why it is here:** Abstention guard for the second domain.

**Correct behaviour:** retrieve nothing and abstain.

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | — | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | — | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 1.00 | 0 | — | 1 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 1.00 | 0 | — | — |

### AE1 — lookup — aerospace (hold-out)

**Query:** `what does supplier SUP-002 supply`

**Why it is here:** The control: an entity and its direct relations, which flat retrieval can plausibly reach.

**Ground truth (4 entities):** supplier:SUP-002, component:CMP-002, component:CMP-009, component:CMP-015

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.25 | 0.20 | 6 | component:CMP-002, component:CMP-009, component:CMP-015 | — |
| Dense-embedding RAG | PARTIAL | 0.25 | 0.20 | 6 | component:CMP-002, component:CMP-009, component:CMP-015 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.25 | 0.20 | 6 | component:CMP-002, component:CMP-009, component:CMP-015 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.25 | 0.20 | 6 | component:CMP-002, component:CMP-009, component:CMP-015 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.50 | 12 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.73 | 7 | (nothing) | 4 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.73 | 7 | (nothing) | 4 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.40 | 6 | component:CMP-002, component:CMP-009 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.62 | 9 | (nothing) | 4 |

### AE2 — multi_hop — aerospace (hold-out)

**Query:** `which factories are affected by the Thailand flood`

**Why it is here:** Three hops from event to factory. The paper's Q1, and no chunk contains the chain.

**Ground truth (1 entity):** factory:FAC-005

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 4 | factory:FAC-005 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | factory:FAC-005 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | factory:FAC-005 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 4 | factory:FAC-005 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.22 | 8 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.20 | 9 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.20 | 9 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 4 | factory:FAC-005 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.20 | 9 | (nothing) | 1 |

### AE3 — degree — aerospace (hold-out)

**Query:** `which components have only one active supplier`

**Why it is here:** In-degree over every component. The paper's Q8 — its agentic baseline found 1 of 15.

**Ground truth (15 entities):** component:CMP-001, component:CMP-002, component:CMP-003, component:CMP-004, component:CMP-005, component:CMP-006, component:CMP-007, component:CMP-008, component:CMP-009, component:CMP-010, component:CMP-011, component:CMP-012, +3 more

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-002, component:CMP-003, component:CMP-004, +11 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-002, component:CMP-003, component:CMP-004, +11 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-002, component:CMP-003, component:CMP-004, +11 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-002, component:CMP-003, component:CMP-004, +11 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 9 | component:CMP-001, component:CMP-002, component:CMP-003, component:CMP-004, +11 more | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 15 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 15 | (nothing) | 6 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.07 | 0.10 | 6 | component:CMP-002, component:CMP-003, component:CMP-004, component:CMP-005, +10 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.86 | 20 | (nothing) | 6 |

### AE4 — inverse — aerospace (hold-out)

**Query:** `which customers are not affected by the Thailand flood`

**Why it is here:** Blast radius then complement. The paper's Q9, where every text architecture scored zero.

**Ground truth (1 entity):** customer:CUS-004

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 4 | customer:CUS-004 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | customer:CUS-004 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-004 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 4 | customer:CUS-004 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 8 | customer:CUS-004 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.40 | 4 | (nothing) | 5 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.40 | 4 | (nothing) | 5 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 4 | customer:CUS-004 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.22 | 8 | (nothing) | 5 |

### AE5 — aggregation — aerospace (hold-out)

**Query:** `which product is built at the most factories`

**Why it is here:** A count over the whole assembly map, ranked.

**Ground truth (5 entities):** product:PRD-001, factory:FAC-001, factory:FAC-003, factory:FAC-004, factory:FAC-005

**Must rank first:** `product:PRD-001`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 1 | product:PRD-001, factory:FAC-001, factory:FAC-003, factory:FAC-004, +1 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | product:PRD-001, factory:FAC-001, factory:FAC-003, factory:FAC-004, +1 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | product:PRD-001, factory:FAC-001, factory:FAC-003, factory:FAC-004, +1 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 1 | product:PRD-001, factory:FAC-001, factory:FAC-003, factory:FAC-004, +1 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 3 | product:PRD-001, factory:FAC-001, factory:FAC-003, factory:FAC-004, +1 more | 4 |
| Query planner, 9 traversal primitives | PARTIAL | 0.20 | 0.18 | 6 | factory:FAC-001, factory:FAC-003, factory:FAC-004, factory:FAC-005 | 6 |
| Adaptive planner, 15 operators | PARTIAL | 0.20 | 0.18 | 6 | factory:FAC-001, factory:FAC-003, factory:FAC-004, factory:FAC-005 | 6 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.91 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.63 | 11 | (nothing) | 6 |

### AE6 — what_if — aerospace (hold-out)

**Query:** `if TechChip is dropped which components lose their only supplier`

**Why it is here:** Counterfactual removal. The paper's Q7, where its ReAct agent hallucinated alternative suppliers.

**Ground truth (3 entities):** component:CMP-001, component:CMP-006, component:CMP-014

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-006, component:CMP-014 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-006, component:CMP-014 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-006, component:CMP-014 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | component:CMP-001, component:CMP-006, component:CMP-014 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.32 | 16 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.86 | 4 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 3 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | 1 |

### AE7 — comparison — aerospace (hold-out)

**Query:** `compare WideBird-X50 and RegionalJet-150`

**Why it is here:** Dual upstream traversal with parallel metrics. The paper's Q10.

**Ground truth (4 entities):** product:PRD-001, product:PRD-002, factory:FAC-001, factory:FAC-003

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.50 | 0.67 | 2 | factory:FAC-001, factory:FAC-003 | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.80 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.80 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.50 | 0.67 | 2 | factory:FAC-001, factory:FAC-003 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.42 | 15 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.27 | 26 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.20 | 37 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.75 | 0.60 | 6 | product:PRD-002 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.20 | 37 | (nothing) | 1 |

### AE8 — temporal — aerospace (hold-out)

**Query:** `who supplies the Flight Control Unit now`

**Why it is here:** The expired ShenzhenChip contract is still in the prose. The paper's Q6.

**Ground truth (1 entity):** supplier:SUP-001

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-001 | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-001 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-001 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.11 | 18 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.67 | 2 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 2 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | 1 |

### AE9 — propagation — aerospace (hold-out)

**Query:** `rank products by exposure to open risk events`

**Why it is here:** Severity-weighted multi-hop scoring. The paper's Q11, where standard RAG returned zero matches.

**Ground truth (6 entities):** product:PRD-001, product:PRD-005, product:PRD-003, product:PRD-004, product:PRD-002, product:PRD-006

**Must rank first:** `product:PRD-001`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | product:PRD-001, product:PRD-005, product:PRD-003, product:PRD-004, +2 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | product:PRD-001, product:PRD-005, product:PRD-003, product:PRD-004, +2 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | product:PRD-001, product:PRD-005, product:PRD-003, product:PRD-004, +2 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | product:PRD-001, product:PRD-005, product:PRD-003, product:PRD-004, +2 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 10 | product:PRD-001, product:PRD-005, product:PRD-003, product:PRD-004, +2 more | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 6 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 6 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.17 | 0.17 | 6 | product:PRD-005, product:PRD-003, product:PRD-004, product:PRD-002, +1 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.71 | 11 | (nothing) | 1 |

### AE10 — prose — aerospace (hold-out)

**Query:** `when is a part registered as a single-source exception`

**Why it is here:** Genuinely a prose question — the control in the other direction.

**Ground truth (1 entity):** aero-sourcing-standard#c0

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.33 | 5 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.33 | 5 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.33 | 5 | (nothing) | 4 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 0 | aero-sourcing-standard#c0 | — |
| Adaptive planner, 15 operators | FAIL | 0.00 | 0.00 | 0 | aero-sourcing-standard#c0 | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |

### AE11 — absence — aerospace (hold-out)

**Query:** `which suppliers have no open risk event`

**Why it is here:** Absence over the risk register. Every supplier appears in the corpus; only the graph knows which one is unencumbered.

**Ground truth (1 entity):** supplier:SUP-009

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-009 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-009 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-009 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-009 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 13 | supplier:SUP-009 | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-009 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.11 | 17 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | supplier:SUP-009 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.10 | 20 | (nothing) | 2 |

### AE12 — out_of_domain — aerospace (hold-out)

**Query:** `what is the melting point of tungsten`

**Why it is here:** Materials-adjacent vocabulary, no answer in the graph.

**Correct behaviour:** retrieve nothing and abstain.

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | — | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | — | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 1.00 | 0 | — | 1 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 1.00 | 0 | — | — |

### RE1 — lookup — retail (hold-out)

**Query:** `what does seller SEL-02 list`

**Why it is here:** Entity and direct relations.

**Ground truth (3 entities):** seller:SEL-02, product:PRD-04, product:PRD-07

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | — |
| Dense-embedding RAG | PARTIAL | 0.33 | 0.22 | 6 | product:PRD-04, product:PRD-07 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.33 | 0.22 | 6 | product:PRD-04, product:PRD-07 | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.67 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.32 | 16 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.75 | 5 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.75 | 5 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.67 | 0.44 | 6 | product:PRD-04 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.55 | 8 | (nothing) | 2 |

### RE2 — aggregation — retail (hold-out)

**Query:** `which seller has the most returned or refunded orders`

**Why it is here:** The aggregation failure mode in its most dangerous form: every chunk is a real order, so a confabulated total is fully cited.

**Ground truth (4 entities):** seller:SEL-05, order:ORD-1005, order:ORD-1006, order:ORD-1007

**Must rank first:** `seller:SEL-05`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.25 | 0.20 | 6 | seller:SEL-05, order:ORD-1005, order:ORD-1007 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | seller:SEL-05, order:ORD-1005, order:ORD-1006, order:ORD-1007 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | seller:SEL-05, order:ORD-1005, order:ORD-1006, order:ORD-1007 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.25 | 0.20 | 6 | seller:SEL-05, order:ORD-1005, order:ORD-1007 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.25 | 0.17 | 8 | seller:SEL-05, order:ORD-1005, order:ORD-1007 | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.25 | 0.20 | 6 | order:ORD-1005, order:ORD-1006, order:ORD-1007 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | seller:SEL-05, order:ORD-1005, order:ORD-1006, order:ORD-1007 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.44 | 14 | (nothing) | 1 |

### RE3 — absence — retail (hold-out)

**Query:** `which products have no orders`

**Why it is here:** Absence. Similarity search can only return products that DO appear in an order.

**Ground truth (1 entity):** product:PRD-08

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 3 | product:PRD-08 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 3 | product:PRD-08 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 8 | product:PRD-08 | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.09 | 22 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.08 | 25 | (nothing) | 2 |

### RE4 — degree — retail (hold-out)

**Query:** `which products are listed by only one seller`

**Why it is here:** Degree counting across the catalogue.

**Ground truth (4 entities):** product:PRD-02, product:PRD-04, product:PRD-06, product:PRD-08

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | product:PRD-02, product:PRD-04, product:PRD-06, product:PRD-08 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | product:PRD-02, product:PRD-04, product:PRD-06, product:PRD-08 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | product:PRD-02, product:PRD-04, product:PRD-06, product:PRD-08 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | product:PRD-02, product:PRD-04, product:PRD-06, product:PRD-08 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 9 | product:PRD-02, product:PRD-04, product:PRD-06, product:PRD-08 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 6 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | product:PRD-02, product:PRD-04, product:PRD-06, product:PRD-08 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.44 | 14 | (nothing) | 6 |

### RE5 — temporal — retail (hold-out)

**Query:** `which campaign is discounting EchoBud Pro now`

**Why it is here:** Two campaigns name the product in prose; one of them ended in July.

**Ground truth (1 entity):** campaign:CMP-D

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | campaign:CMP-D | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | campaign:CMP-D | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | campaign:CMP-D | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | campaign:CMP-D | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.10 | 20 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.18 | 10 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.18 | 10 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | campaign:CMP-D | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.15 | 12 | (nothing) | 1 |

### RE6 — what_if — retail (hold-out)

**Query:** `if CraftHouse is dropped which products lose their only seller`

**Why it is here:** Counterfactual over listings.

**Ground truth (1 entity):** product:PRD-08

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | product:PRD-08 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.11 | 17 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.50 | 3 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 1 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | 1 |

### RE7 — multi_hop — retail (hold-out)

**Query:** `which customers ordered a product with an open complaint`

**Why it is here:** Three hops: complaint to product to order to customer.

**Ground truth (4 entities):** customer:CUS-01, customer:CUS-02, customer:CUS-03, customer:CUS-04

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-01, customer:CUS-02, customer:CUS-03, customer:CUS-04 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | customer:CUS-01, customer:CUS-02, customer:CUS-03, customer:CUS-04 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-01, customer:CUS-02, customer:CUS-03, customer:CUS-04 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-01, customer:CUS-02, customer:CUS-03, customer:CUS-04 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 10 | customer:CUS-01, customer:CUS-02, customer:CUS-03, customer:CUS-04 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.89 | 5 | (nothing) | 5 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-01, customer:CUS-02, customer:CUS-03, customer:CUS-04 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.47 | 13 | (nothing) | 1 |

### RE8 — inverse — retail (hold-out)

**Query:** `which customers have no returned or refunded orders`

**Why it is here:** A filtered complement over the order ledger.

**Ground truth (2 entities):** customer:CUS-04, customer:CUS-05

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-04, customer:CUS-05 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | customer:CUS-04, customer:CUS-05 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-04, customer:CUS-05 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-04, customer:CUS-05 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 7 | customer:CUS-04, customer:CUS-05 | 5 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.57 | 5 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.19 | 19 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | customer:CUS-04, customer:CUS-05 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.15 | 24 | (nothing) | 2 |

### RE9 — comparison — retail (hold-out)

**Query:** `compare seller NorthMart and seller UrbanKart`

**Why it is here:** Two seller subgraphs enumerated and set against each other.

**Ground truth (3 entities):** seller:SEL-01, seller:SEL-05, product:PRD-01

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.67 | 0.44 | 6 | product:PRD-01 | — |
| Dense-embedding RAG | PARTIAL | 0.67 | 0.44 | 6 | product:PRD-01 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.67 | 0.44 | 6 | product:PRD-01 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.67 | 0.44 | 6 | product:PRD-01 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.25 | 21 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.16 | 35 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.14 | 41 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.67 | 0.44 | 6 | seller:SEL-05 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.14 | 41 | (nothing) | 1 |

### RE10 — propagation — retail (hold-out)

**Query:** `rank products by exposure to open complaints`

**Why it is here:** Severity-weighted scoring that spreads from complained-about products to their shelf-mates.

**Ground truth (6 entities):** product:PRD-02, product:PRD-01, product:PRD-05, product:PRD-03, product:PRD-04, product:PRD-07

**Must rank first:** `product:PRD-02`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 3 | product:PRD-02, product:PRD-01, product:PRD-05, product:PRD-03, +2 more | — |
| Dense-embedding RAG | PARTIAL | 0.17 | 0.17 | 6 | product:PRD-02, product:PRD-01, product:PRD-05, product:PRD-03, +1 more | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.17 | 0.17 | 6 | product:PRD-02, product:PRD-01, product:PRD-05, product:PRD-03, +1 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 3 | product:PRD-02, product:PRD-01, product:PRD-05, product:PRD-03, +2 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 5 | product:PRD-02, product:PRD-01, product:PRD-05, product:PRD-03, +2 more | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 6 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 6 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.17 | 0.17 | 6 | product:PRD-02, product:PRD-05, product:PRD-03, product:PRD-04, +1 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.71 | 11 | (nothing) | 1 |

### RE11 — prose — retail (hold-out)

**Query:** `when does a seller enter commercial review`

**Why it is here:** Prose control.

**Ground truth (1 entity):** retail-returns-policy#c1

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.18 | 10 | (nothing) | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 0 | retail-returns-policy#c1 | — |
| Adaptive planner, 15 operators | FAIL | 0.00 | 0.00 | 0 | retail-returns-policy#c1 | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |

### RE12 — out_of_domain — retail (hold-out)

**Query:** `what is the tallest mountain in Africa`

**Why it is here:** Abstention guard.

**Correct behaviour:** retrieve nothing and abstain.

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | — | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | — | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 1.00 | 0 | — | 1 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 1.00 | 0 | — | — |

### MF1 — lookup — manufacturing (hold-out)

**Query:** `what does work order WO-1005 produce`

**Why it is here:** Entity and its direct output.

**Ground truth (2 entities):** workOrder:WO-1005, batch:BAT-05

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Dense-embedding RAG | PARTIAL | 0.50 | 0.25 | 6 | workOrder:WO-1005 | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.21 | 17 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.67 | 4 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 4 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | 2 |

### MF2 — aggregation — manufacturing (hold-out)

**Query:** `which line produced the most defects`

**Why it is here:** Three hops from line to defect, counted over every line. The deepest aggregation in the set.

**Ground truth (5 entities):** line:LN-04, defect:DEF-03, defect:DEF-04, defect:DEF-08, defect:DEF-09

**Must rank first:** `line:LN-04`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | line:LN-04, defect:DEF-03, defect:DEF-04, defect:DEF-08, +1 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | line:LN-04, defect:DEF-03, defect:DEF-04, defect:DEF-08, +1 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | line:LN-04, defect:DEF-03, defect:DEF-04, defect:DEF-08, +1 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | line:LN-04, defect:DEF-03, defect:DEF-04, defect:DEF-08, +1 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 9 | line:LN-04, defect:DEF-03, defect:DEF-04, defect:DEF-08, +1 more | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.20 | 0.18 | 6 | defect:DEF-03, defect:DEF-04, defect:DEF-08, defect:DEF-09 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.53 | 14 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | line:LN-04, defect:DEF-03, defect:DEF-04, defect:DEF-08, +1 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.43 | 18 | (nothing) | 1 |

### MF3 — absence — manufacturing (hold-out)

**Query:** `which lines have no defects recorded`

**Why it is here:** Absence at depth — the line has to be reached through two intermediate hops before it can be excluded.

**Ground truth (1 entity):** line:LN-02

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 1 | line:LN-02 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | line:LN-02 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | line:LN-02 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 1 | line:LN-02 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 3 | line:LN-02 | 4 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.29 | 6 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.13 | 15 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | line:LN-02 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.11 | 18 | (nothing) | 2 |

### MF4 — degree — manufacturing (hold-out)

**Query:** `which machines are installed on only one line`

**Why it is here:** Degree over the equipment register.

**Ground truth (7 entities):** machine:MCH-01, machine:MCH-03, machine:MCH-04, machine:MCH-05, machine:MCH-06, machine:MCH-08, machine:MCH-09

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.29 | 0.31 | 6 | machine:MCH-04, machine:MCH-05, machine:MCH-06, machine:MCH-08, +1 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | machine:MCH-01, machine:MCH-03, machine:MCH-04, machine:MCH-05, +3 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | machine:MCH-01, machine:MCH-03, machine:MCH-04, machine:MCH-05, +3 more | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.29 | 0.31 | 6 | machine:MCH-04, machine:MCH-05, machine:MCH-06, machine:MCH-08, +1 more | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.29 | 0.29 | 7 | machine:MCH-04, machine:MCH-05, machine:MCH-06, machine:MCH-08, +1 more | 5 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.82 | 10 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.82 | 10 | (nothing) | 6 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | machine:MCH-01, machine:MCH-03, machine:MCH-04, machine:MCH-05, +3 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.61 | 16 | (nothing) | 6 |

### MF5 — what_if — manufacturing (hold-out)

**Query:** `if the Powder Coat Booth fails which lines lose their only machine`

**Why it is here:** A single-machine cell is a genuine counterfactual; every other line degrades instead of stopping.

**Ground truth (1 entity):** line:LN-05

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | line:LN-05 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | line:LN-05 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | line:LN-05 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | line:LN-05 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.18 | 10 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.67 | 2 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.67 | 2 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.33 | 5 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.33 | 5 | (nothing) | 2 |

### MF6 — multi_hop — manufacturing (hold-out)

**Query:** `which materials feed the line that produced batch BAT-07`

**Why it is here:** Batch to work order to line to material — three hops in two directions.

**Ground truth (1 entity):** material:MAT-05

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | material:MAT-05 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | material:MAT-05 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | material:MAT-05 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | material:MAT-05 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.13 | 15 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.15 | 12 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.15 | 12 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | material:MAT-05 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.15 | 12 | (nothing) | 1 |

### MF7 — comparison — manufacturing (hold-out)

**Query:** `compare line LN-04 and line LN-02`

**Why it is here:** Two line subgraphs compared.

**Ground truth (4 entities):** line:LN-04, line:LN-02, plant:PLT-03, plant:PLT-01

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.50 | 0.40 | 6 | plant:PLT-03, plant:PLT-01 | — |
| Dense-embedding RAG | PARTIAL | 0.50 | 0.40 | 6 | plant:PLT-03, plant:PLT-01 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.50 | 0.40 | 6 | plant:PLT-03, plant:PLT-01 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.50 | 0.40 | 6 | plant:PLT-03, plant:PLT-01 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.75 | 0.40 | 11 | plant:PLT-03 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.28 | 25 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.20 | 36 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.40 | 6 | line:LN-04, plant:PLT-03 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.20 | 36 | (nothing) | 1 |

### MF8 — temporal — manufacturing (hold-out)

**Query:** `which work orders started on or after 2026-08-04`

**Why it is here:** A date window over the schedule.

**Ground truth (4 entities):** workOrder:WO-1009, workOrder:WO-1010, workOrder:WO-1011, workOrder:WO-1012

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.50 | 0.40 | 6 | workOrder:WO-1010, workOrder:WO-1012 | — |
| Dense-embedding RAG | PARTIAL | 0.25 | 0.20 | 6 | workOrder:WO-1010, workOrder:WO-1011, workOrder:WO-1012 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.25 | 0.20 | 6 | workOrder:WO-1010, workOrder:WO-1011, workOrder:WO-1012 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.50 | 0.40 | 6 | workOrder:WO-1010, workOrder:WO-1012 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.50 | 0.21 | 15 | workOrder:WO-1010, workOrder:WO-1012 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.33 | 20 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.33 | 20 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.25 | 0.20 | 6 | workOrder:WO-1010, workOrder:WO-1011, workOrder:WO-1012 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.32 | 21 | (nothing) | 1 |

### MF9 — propagation — manufacturing (hold-out)

**Query:** `rank plants by exposure to open defects`

**Why it is here:** Four hops of severity-weighted propagation, defect to plant.

**Ground truth (3 entities):** plant:PLT-03, plant:PLT-02, plant:PLT-01

**Must rank first:** `plant:PLT-03`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 1 | plant:PLT-03, plant:PLT-02, plant:PLT-01 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | plant:PLT-03, plant:PLT-02, plant:PLT-01 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | plant:PLT-03, plant:PLT-02, plant:PLT-01 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 1 | plant:PLT-03, plant:PLT-02, plant:PLT-01 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 3 | plant:PLT-03, plant:PLT-02, plant:PLT-01 | 4 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 3 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 3 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | plant:PLT-03, plant:PLT-02, plant:PLT-01 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.50 | 9 | (nothing) | 1 |

### MF10 — prose — manufacturing (hold-out)

**Query:** `when does a line go on containment`

**Why it is here:** Prose control.

**Ground truth (1 entity):** mfg-containment-runbook#c0

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.10 | 19 | (nothing) | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 0 | mfg-containment-runbook#c0 | — |
| Adaptive planner, 15 operators | FAIL | 0.00 | 0.00 | 0 | mfg-containment-runbook#c0 | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |

### MF11 — out_of_domain — manufacturing (hold-out)

**Query:** `how do I tune a guitar`

**Why it is here:** Abstention guard with a "how do I" shape.

**Correct behaviour:** retrieve nothing and abstain.

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | — | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | — | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 1.00 | 0 | — | 1 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 1.00 | 0 | — | — |

### LG1 — lookup — logistics (hold-out)

**Query:** `what does carrier CAR-02 handle`

**Why it is here:** Entity and direct relations.

**Ground truth (4 entities):** carrier:CAR-02, shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.80 | 6 | (nothing) | — |
| Dense-embedding RAG | PARTIAL | 0.25 | 0.20 | 6 | shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.75 | 0.60 | 6 | shipment:SHP-2003 | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.80 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.47 | 13 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 4 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 4 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.75 | 0.60 | 6 | shipment:SHP-2006 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.73 | 7 | (nothing) | 2 |

### LG2 — multi_hop — logistics (hold-out)

**Query:** `what is the lane route from Chennai to Hamburg`

**Why it is here:** A route, not a neighbourhood. The only question in the set whose answer is an ordered path.

**Ground truth (4 entities):** hub:HUB-01, hub:HUB-03, hub:HUB-04, hub:HUB-05

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.50 | 0.40 | 6 | hub:HUB-03, hub:HUB-04 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | hub:HUB-01, hub:HUB-03, hub:HUB-04, hub:HUB-05 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.50 | 0.40 | 6 | hub:HUB-03, hub:HUB-04 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.50 | 0.40 | 6 | hub:HUB-03, hub:HUB-04 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.38 | 17 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 4 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 4 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.40 | 6 | hub:HUB-04, hub:HUB-05 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 1 |

### LG3 — degree — logistics (hold-out)

**Query:** `which hub is the biggest bottleneck in the network`

**Why it is here:** Betweenness centrality. Dubai is the sole crossing between the eastern and western halves, and nothing in any hub record says so.

**Ground truth (1 entity):** hub:HUB-03

**Must rank first:** `hub:HUB-03`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 1.00 | 0.29 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 1.00 | 0.29 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 1.00 | 0.14 | 13 | (nothing) | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 1.00 | 0.29 | 6 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.18 | 10 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | hub:HUB-03 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.13 | 15 | (nothing) | 1 |

### LG4 — aggregation — logistics (hold-out)

**Query:** `which carrier moved the most delayed shipments`

**Why it is here:** A filtered count across the shipment ledger.

**Ground truth (4 entities):** carrier:CAR-02, shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006

**Must rank first:** `carrier:CAR-02`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.25 | 0.20 | 6 | shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | carrier:CAR-02, shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.25 | 0.20 | 6 | shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.25 | 0.20 | 6 | shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.25 | 0.12 | 13 | shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.25 | 0.25 | 4 | shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | 4 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.73 | 7 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | carrier:CAR-02, shipment:SHP-2003, shipment:SHP-2004, shipment:SHP-2006 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.53 | 11 | (nothing) | 1 |

### LG5 — absence — logistics (hold-out)

**Query:** `which consignees have no delayed shipments`

**Why it is here:** A filtered complement.

**Ground truth (1 entity):** consignee:CNE-04

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | consignee:CNE-04 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | consignee:CNE-04 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | consignee:CNE-04 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | consignee:CNE-04 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 13 | consignee:CNE-04 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.40 | 4 | (nothing) | 5 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.13 | 15 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | consignee:CNE-04 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.10 | 20 | (nothing) | 2 |

### LG6 — what_if — logistics (hold-out)

**Query:** `if RailBridge Logistics is dropped which shipments lose their only carrier`

**Why it is here:** Counterfactual over carriage.

**Ground truth (2 entities):** shipment:SHP-2005, shipment:SHP-2008

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | shipment:SHP-2005, shipment:SHP-2008 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | shipment:SHP-2005, shipment:SHP-2008 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | shipment:SHP-2005, shipment:SHP-2008 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | shipment:SHP-2005, shipment:SHP-2008 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.25 | 14 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 2 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 2 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | 1 |

### LG7 — inverse — logistics (hold-out)

**Query:** `which hubs are isolated from the main freight network`

**Why it is here:** Connected components. Isolation is invisible to similarity search by construction — an isolated hub matches the query no worse than a connected one.

**Ground truth (2 entities):** hub:HUB-09, hub:HUB-10

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 2 | hub:HUB-09, hub:HUB-10 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | hub:HUB-09, hub:HUB-10 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | hub:HUB-09, hub:HUB-10 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 2 | hub:HUB-09, hub:HUB-10 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 6 | hub:HUB-09, hub:HUB-10 | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 6 | hub:HUB-09, hub:HUB-10 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 2 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | hub:HUB-09, hub:HUB-10 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.40 | 8 | (nothing) | 1 |

### LG8 — comparison — logistics (hold-out)

**Query:** `compare the Rotterdam and Chennai hubs`

**Why it is here:** Two hub neighbourhoods compared.

**Ground truth (2 entities):** hub:HUB-04, hub:HUB-01

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.80 | 3 | (nothing) | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | hub:HUB-04, hub:HUB-01 | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.80 | 3 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.22 | 16 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.19 | 19 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.19 | 19 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.25 | 6 | hub:HUB-04 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.19 | 19 | (nothing) | 1 |

### LG9 — temporal — logistics (hold-out)

**Query:** `which lanes opened on or after 2026-06-01`

**Why it is here:** A window over edge validity, not over node attributes — the case a record-oriented retriever has no handle on at all.

**Ground truth (4 entities):** hub:HUB-01, hub:HUB-03, hub:HUB-04, hub:HUB-08

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | hub:HUB-01, hub:HUB-03, hub:HUB-04, hub:HUB-08 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | hub:HUB-01, hub:HUB-03, hub:HUB-04, hub:HUB-08 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | hub:HUB-01, hub:HUB-03, hub:HUB-04, hub:HUB-08 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | hub:HUB-01, hub:HUB-03, hub:HUB-04, hub:HUB-08 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.75 | 0.26 | 19 | hub:HUB-01 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 4 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 4 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.40 | 6 | hub:HUB-01, hub:HUB-08 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.67 | 8 | (nothing) | 1 |

### LG10 — propagation — logistics (hold-out)

**Query:** `rank shipments by exposure to open disruptions`

**Why it is here:** Severity-weighted exposure across the network.

**Ground truth (9 entities):** shipment:SHP-2008, shipment:SHP-2007, shipment:SHP-2002, shipment:SHP-2005, shipment:SHP-2001, shipment:SHP-2010, shipment:SHP-2003, shipment:SHP-2006, shipment:SHP-2004

**Must rank first:** `shipment:SHP-2008`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 4 | shipment:SHP-2008, shipment:SHP-2007, shipment:SHP-2002, shipment:SHP-2005, +5 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | shipment:SHP-2008, shipment:SHP-2007, shipment:SHP-2002, shipment:SHP-2005, +5 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | shipment:SHP-2008, shipment:SHP-2007, shipment:SHP-2002, shipment:SHP-2005, +5 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 4 | shipment:SHP-2008, shipment:SHP-2007, shipment:SHP-2002, shipment:SHP-2005, +5 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 4 | shipment:SHP-2008, shipment:SHP-2007, shipment:SHP-2002, shipment:SHP-2005, +5 more | 4 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 9 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 9 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | shipment:SHP-2008, shipment:SHP-2007, shipment:SHP-2002, shipment:SHP-2005, +5 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.75 | 15 | (nothing) | 1 |

### LG11 — prose — logistics (hold-out)

**Query:** `when is a shipment re-routed rather than held`

**Why it is here:** Prose control.

**Ground truth (4 entities):** log-disruption-handling#c1, log-disruption-handling#c2, log-routing-policy#c0, log-routing-policy#c1

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.80 | 6 | (nothing) | — |
| Dense-embedding RAG | PARTIAL | 0.25 | 0.20 | 6 | log-disruption-handling#c1, log-disruption-handling#c2, log-routing-policy#c0 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.50 | 0.40 | 6 | log-disruption-handling#c1, log-disruption-handling#c2 | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.80 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.80 | 6 | (nothing) | 4 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 0 | log-disruption-handling#c1, log-disruption-handling#c2, log-routing-policy#c0, log-routing-policy#c1 | — |
| Adaptive planner, 15 operators | FAIL | 0.00 | 0.00 | 0 | log-disruption-handling#c1, log-disruption-handling#c2, log-routing-policy#c0, log-routing-policy#c1 | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.40 | 6 | log-disruption-handling#c1, log-disruption-handling#c2 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | PARTIAL | 0.50 | 0.40 | 6 | log-disruption-handling#c1, log-disruption-handling#c2 | — |

### LG12 — out_of_domain — logistics (hold-out)

**Query:** `what is the population of Iceland`

**Why it is here:** Geography-adjacent vocabulary, no answer in the graph.

**Correct behaviour:** retrieve nothing and abstain.

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | — | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | — | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 1.00 | 0 | — | 1 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 1.00 | 0 | — | — |

### FN1 — lookup — finance (hold-out)

**Query:** `what is account ACC-05`

**Why it is here:** Entity lookup.

**Ground truth (1 entity):** account:ACC-05

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.10 | 19 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.12 | 16 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.12 | 16 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.12 | 16 | (nothing) | 2 |

### FN2 — aggregation — finance (hold-out)

**Query:** `which account is flagged by the most alerts`

**Why it is here:** A count that decides whether an account goes under enhanced monitoring.

**Ground truth (3 entities):** account:ACC-05, alert:ALR-01, alert:ALR-05

**Must rank first:** `account:ACC-05`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | account:ACC-05, alert:ALR-01, alert:ALR-05 | — |
| Dense-embedding RAG | PARTIAL | 0.33 | 0.22 | 6 | alert:ALR-01, alert:ALR-05 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.33 | 0.22 | 6 | alert:ALR-01, alert:ALR-05 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | account:ACC-05, alert:ALR-01, alert:ALR-05 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 11 | account:ACC-05, alert:ALR-01, alert:ALR-05 | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.33 | 0.22 | 6 | alert:ALR-01, alert:ALR-05 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.50 | 9 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | account:ACC-05, alert:ALR-01, alert:ALR-05 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.33 | 15 | (nothing) | 1 |

### FN3 — degree — finance (hold-out)

**Query:** `which account is the most central in the payment network`

**Why it is here:** PageRank over the counterparty graph. The policy document says outright that counting one account's incoming payments is not the same question.

**Ground truth (1 entity):** account:ACC-05

**Must rank first:** `account:ACC-05`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | account:ACC-05 | — |
| Dense-embedding RAG | PARTIAL | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | account:ACC-05 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 1.00 | 0.08 | 24 | (nothing) | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 1.00 | 0.29 | 6 | (nothing) | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.18 | 10 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | account:ACC-05 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.13 | 15 | (nothing) | 1 |

### FN4 — absence — finance (hold-out)

**Query:** `which accounts have no alerts raised against them`

**Why it is here:** Absence over the alert register.

**Ground truth (10 entities):** account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, account:ACC-06, account:ACC-08, account:ACC-10, account:ACC-12, account:ACC-13, account:ACC-14

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, +6 more | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, +6 more | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, +6 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, +6 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 9 | account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, +6 more | 6 |
| Query planner, 9 traversal primitives | PARTIAL | 0.50 | 0.63 | 6 | account:ACC-08, account:ACC-10, account:ACC-12, account:ACC-13, +1 more | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.69 | 19 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.10 | 0.13 | 6 | account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, +5 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.65 | 21 | (nothing) | 2 |

### FN5 — inverse — finance (hold-out)

**Query:** `which accounts form a closed group with no link to the rest of the network`

**Why it is here:** Connected components. The nominee ring transacts only with itself, and no amount of similarity search can notice an absence of links.

**Ground truth (3 entities):** account:ACC-11, account:ACC-12, account:ACC-13

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 4 | account:ACC-11, account:ACC-12, account:ACC-13 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | account:ACC-11, account:ACC-12, account:ACC-13 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | account:ACC-11, account:ACC-12, account:ACC-13 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 4 | account:ACC-11, account:ACC-12, account:ACC-13 | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 6 | account:ACC-11, account:ACC-12, account:ACC-13 | 6 |
| Query planner, 9 traversal primitives | FAIL | 0.00 | 0.00 | 6 | account:ACC-11, account:ACC-12, account:ACC-13 | 6 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 3 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | account:ACC-11, account:ACC-12, account:ACC-13 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.50 | 9 | (nothing) | 1 |

### FN6 — what_if — finance (hold-out)

**Query:** `if account ACC-08 is frozen which accounts lose their only counterparty`

**Why it is here:** The freezing procedure asks for exactly this before acting, and no single record answers it.

**Ground truth (1 entity):** account:ACC-14

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | account:ACC-14 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | account:ACC-14 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | account:ACC-14 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | account:ACC-14 | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.14 | 13 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.25 | 7 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 1 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | account:ACC-14 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.25 | 7 | (nothing) | 1 |

### FN7 — multi_hop — finance (hold-out)

**Query:** `which institutions are exposed to the alert on ACC-05`

**Why it is here:** Alert to account to counterparties to institutions.

**Ground truth (3 entities):** institution:INS-03, institution:INS-01, institution:INS-02

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 6 | institution:INS-03, institution:INS-01, institution:INS-02 | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | institution:INS-03, institution:INS-01, institution:INS-02 | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | institution:INS-03, institution:INS-01, institution:INS-02 | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 6 | institution:INS-03, institution:INS-01, institution:INS-02 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.67 | 0.20 | 17 | institution:INS-01 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.19 | 29 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.19 | 29 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.33 | 0.22 | 6 | institution:INS-01, institution:INS-02 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.19 | 29 | (nothing) | 1 |

### FN8 — comparison — finance (hold-out)

**Query:** `compare account ACC-05 and account ACC-09`

**Why it is here:** Two account neighbourhoods compared.

**Ground truth (2 entities):** account:ACC-05, account:ACC-09

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.50 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.25 | 14 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.13 | 29 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.13 | 29 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.50 | 0.25 | 6 | account:ACC-09 | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.13 | 29 | (nothing) | 1 |

### FN9 — temporal — finance (hold-out)

**Query:** `which transfers settled on or after 2026-08-05`

**Why it is here:** A date window over the ledger.

**Ground truth (5 entities):** transfer:TRF-3009, transfer:TRF-3010, transfer:TRF-3011, transfer:TRF-3013, transfer:TRF-3014

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | PARTIAL | 0.40 | 0.36 | 6 | transfer:TRF-3010, transfer:TRF-3013, transfer:TRF-3014 | — |
| Dense-embedding RAG | PARTIAL | 0.60 | 0.55 | 6 | transfer:TRF-3010, transfer:TRF-3014 | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.60 | 0.55 | 6 | transfer:TRF-3010, transfer:TRF-3014 | — |
| Deterministic GraphRAG (bespoke handlers) | PARTIAL | 0.40 | 0.36 | 6 | transfer:TRF-3010, transfer:TRF-3013, transfer:TRF-3014 | — |
| Agentic RAG (ReAct, retrieval tools) | PARTIAL | 0.60 | 0.19 | 26 | transfer:TRF-3010, transfer:TRF-3013 | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.48 | 16 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.48 | 16 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | FAIL | 0.00 | 0.00 | 6 | transfer:TRF-3009, transfer:TRF-3010, transfer:TRF-3011, transfer:TRF-3013, +1 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.40 | 20 | (nothing) | 1 |

### FN10 — propagation — finance (hold-out)

**Query:** `rank accounts by exposure to open alerts`

**Why it is here:** Severity-weighted exposure that spreads to counterparties.

**Ground truth (14 entities):** account:ACC-05, account:ACC-07, account:ACC-06, account:ACC-01, account:ACC-02, account:ACC-03, account:ACC-04, account:ACC-08, account:ACC-10, account:ACC-09, account:ACC-11, account:ACC-14, +2 more

**Must rank first:** `account:ACC-05`

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | FAIL | 0.00 | 0.00 | 3 | account:ACC-05, account:ACC-07, account:ACC-06, account:ACC-01, +10 more | — |
| Dense-embedding RAG | PARTIAL | 0.07 | 0.10 | 6 | account:ACC-07, account:ACC-06, account:ACC-01, account:ACC-02, +9 more | — |
| Hybrid lexical + dense (RRF) | PARTIAL | 0.07 | 0.10 | 6 | account:ACC-07, account:ACC-06, account:ACC-01, account:ACC-02, +9 more | — |
| Deterministic GraphRAG (bespoke handlers) | FAIL | 0.00 | 0.00 | 3 | account:ACC-05, account:ACC-07, account:ACC-06, account:ACC-01, +10 more | — |
| Agentic RAG (ReAct, retrieval tools) | FAIL | 0.00 | 0.00 | 6 | account:ACC-05, account:ACC-07, account:ACC-06, account:ACC-01, +10 more | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 14 | (nothing) | 1 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 14 | (nothing) | 1 |
| Hybrid fused + graph expansion (this repo, retrieval only) | PARTIAL | 0.14 | 0.20 | 6 | account:ACC-07, account:ACC-06, account:ACC-02, account:ACC-03, +8 more | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.88 | 18 | (nothing) | 1 |

### FN11 — prose — finance (hold-out)

**Query:** `when is an account placed under enhanced monitoring`

**Why it is here:** Prose control.

**Ground truth (1 entity):** fin-monitoring-policy#c1

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Dense-embedding RAG | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Hybrid lexical + dense (RRF) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 0.29 | 6 | (nothing) | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.22 | 8 | (nothing) | 6 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.50 | 3 | (nothing) | 2 |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 0.50 | 3 | (nothing) | 2 |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 0.50 | 3 | (nothing) | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.50 | 3 | (nothing) | 2 |

### FN12 — out_of_domain — finance (hold-out)

**Query:** `who painted the Mona Lisa`

**Why it is here:** Abstention guard.

**Correct behaviour:** retrieve nothing and abstain.

| Architecture | Verdict | Recall | F1 | Returned | Missing | Operator calls |
|---|---|---|---|---|---|---|
| Standard RAG (lexical top-K) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Dense-embedding RAG | FAIL | 0.00 | 0.00 | 6 | — | — |
| Hybrid lexical + dense (RRF) | FAIL | 0.00 | 0.00 | 6 | — | — |
| Deterministic GraphRAG (bespoke handlers) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 1.00 | 0 | — | 1 |
| Query planner, 9 traversal primitives | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Adaptive planner, 15 operators | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid fused + graph expansion (this repo, retrieval only) | CORRECT | 1.00 | 1.00 | 0 | — | — |
| Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 1.00 | 0 | — | — |

## The measurement gap

Cases where the verdict and entity-level F1 disagree — the architecture surfaced everything a correct answer needs, and F1 punished it for the extra correct entities it also surfaced. This reproduces the reference paper's own warning about its headline metric.

| Query | Architecture | Verdict | Recall | Precision | F1 | Returned | Required |
|---|---|---|---|---|---|---|---|
| RE3 | Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.04 | 0.08 | 25 | 1 |
| RE3 | Adaptive planner, 15 operators | CORRECT | 1.00 | 0.05 | 0.09 | 22 | 1 |
| AE11 | Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.05 | 0.10 | 20 | 1 |
| RE5 | Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.05 | 0.10 | 20 | 1 |
| LG5 | Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.05 | 0.10 | 20 | 1 |
| MF10 | Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.05 | 0.10 | 19 | 1 |
| FN1 | Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.05 | 0.10 | 19 | 1 |
| AE8 | Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.06 | 0.11 | 18 | 1 |
| MF3 | Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.06 | 0.11 | 18 | 1 |
| AE11 | Adaptive planner, 15 operators | CORRECT | 1.00 | 0.06 | 0.11 | 17 | 1 |
| RE6 | Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.06 | 0.11 | 17 | 1 |
| C3 | Agentic RAG (ReAct, retrieval tools) | CORRECT | 1.00 | 0.06 | 0.12 | 16 | 1 |
| FN1 | Query planner, 9 traversal primitives | CORRECT | 1.00 | 0.06 | 0.12 | 16 | 1 |
| FN1 | Adaptive planner, 15 operators | CORRECT | 1.00 | 0.06 | 0.12 | 16 | 1 |
| FN1 | Hybrid retrieval + operator vocabulary (this repo, production) | CORRECT | 1.00 | 0.06 | 0.12 | 16 | 1 |

