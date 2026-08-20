# MediaOps Copilot — Learning Guide

What you need to actually understand (not just copy-paste) to build and review this assignment alongside me. Organized by layer, in the order you'll hit them while building. Each entry has: what it is in plain English, why *this* assignment needs it, and the checkpoint that tells you you've got it — if you can explain the checkpoint in your own words, you're ready for that layer.

Companion to `MediaOps-Copilot-Plan.md` (the implementation plan) — that file has the *what to build*; this one has the *what to understand first*.

---

## 1. API fundamentals (Hono on Node)

**What it is:** Hono is a lightweight web framework (like Express, but faster and TypeScript-first) that runs routes, middleware, and request/response handling on Node.

**Why this assignment needs it:** every requirement funnels through two routes, `POST /query` and `POST /feedback`. Everything else (retrieval, RL, ML) is a function called *from* a route handler.

**Understand cold:**
- How a Hono route handler receives a parsed JSON body and returns a JSON response.
- Middleware as "code that runs before/after every route" — you'll use this for request logging (attaching a `transaction_id` to every request) and error handling.
- Why request validation (with `zod`) matters: a malformed `/query` body should 400, not crash the process.
- Sync vs. async handlers — every handler here is `async` because it awaits retrieval, the LLM call, and DB reads.

**Checkpoint:** you can explain, without looking it up, what happens step by step from "browser sends POST /query" to "JSON response arrives" — including where validation, logging, and error handling slot in.

---

## 2. Retrieval-Augmented Generation (RAG) — and when *not* to use it

**What it is:** instead of an LLM answering from memory, you first *retrieve* relevant text (from your own docs) and hand it to the LLM as context, so the answer is grounded in real data instead of guessed.

**Why this assignment needs it:** it's half the assignment's title. But the more important skill being tested is knowing when RAG is the *wrong* tool — that's Requirement 2's real point ("knowing when NOT to use it").

**Understand cold:**
- **Embeddings**: a piece of text converted into a vector (a list of numbers) such that semantically similar text produces vectors that are numerically close together. You don't need the math inside the embedding model — you need to know it's a black box that turns "why is my job slow" and "render performance degraded" into nearby vectors, and "RENDER_TIMEOUT" and "QUEUE_TIMEOUT" into *also*-nearby vectors (which is exactly the failure mode that makes exact lookup better for error codes).
- **Cosine similarity**: the standard way to measure "how close" two vectors are (1 = identical direction, 0 = unrelated). This is the ranking function for the vector path.
- **Chunking**: splitting a document into smaller pieces (e.g. by heading, ~150–300 tokens) before embedding, because embedding a whole doc loses precision — you want to retrieve the *specific paragraph* that answers the question, not the whole runbook.
- **Why RAG fails for structured data**: RAG finds "similar text," not "the correct field." If the true answer is a database row (`job.status = RETRY_WAIT`), semantic search can retrieve a *plausible-sounding but wrong* neighbor. This is the core judgment call the assignment grades you on.

**Checkpoint:** you can give one query where semantic search would embarrass you (retrieve something confidently wrong) and explain *why* in terms of embeddings, not vibes.

---

## 3. Vectorless retrieval (structured lookup / BM25)

**What it is:** the "old-fashioned" alternative to embeddings — exact key lookups (dictionary/SQL by ID) or keyword-scoring algorithms like BM25/TF-IDF that rank documents by literal word overlap, weighted by how rare/important each word is.

**Why this assignment needs it:** it's the second retrieval path, and it's the one most candidates under-build because it feels "too simple" — but for exact-identifier queries it's strictly better than the vector path.

**Understand cold:**
- **Exact lookup**: given `job_id = 482`, you don't need any scoring — you go straight to `SELECT * FROM jobs WHERE id = 482`. No ambiguity, no ranking.
- **TF-IDF (term frequency–inverse document frequency)**: a word that appears often in *this* document but rarely across *all* documents is a strong signal for what the document is about. This is what makes keyword search smarter than naive word-counting.
- **BM25**: a refined version of TF-IDF (adds saturation and length normalization) — the standard algorithm behind most "keyword search" you've used (e.g. Elasticsearch's default). You don't need to derive its formula, just know it ranks documents by weighted keyword overlap, with no embeddings involved.
- **Why this is a legitimately different architecture, not a fallback**: no vectors, no embedding model call, deterministic and fast. That's the point Requirement 2 wants demonstrated — two *architecturally distinct* paths, not one path with a shortcut bolted on.

**Checkpoint:** you can explain why a job-ID lookup should never touch the vector store at all — not "because it's faster," but because there is no ranking problem to solve in the first place.

---

## 4. Agentic reasoning — the ReAct pattern

**What it is:** instead of the LLM producing one answer in one shot, it alternates between **Thought** (reasoning about what it needs), **Action** (calling a tool or answering), and **Observation** (the tool's result), looping until it has enough information to answer.

**Why this assignment needs it:** some questions ("why did job #482 fail") need a live fact (current job status) that isn't in any static doc — the agent has to *decide* to call a tool rather than hallucinate a plausible-sounding failure reason.

**Understand cold:**
- **Tool calling**: giving the LLM a list of available functions with descriptions (e.g. `check_job_status(job_id)`) and having it *choose* whether and when to invoke one, versus answering directly.
- **Why structured output matters here**: you need the LLM's response parsed programmatically (is this a tool call or a final answer?), so you constrain it to emit JSON in a fixed shape, not free text.
- **Loop termination**: why you cap iterations (e.g. 3) — an ungrounded model can loop forever "thinking"; a hard cap protects your latency budget (which directly feeds the RL reward function).
- **The difference between "agentic" and "just RAG"**: RAG retrieves once, then generates. An agent can decide to retrieve, call a tool, retrieve again, and *then* generate — the reasoning is dynamic, not a fixed pipeline.

**Checkpoint:** you can trace, for "why is job #482 stuck," the exact Thought → Action → Observation → Thought → Answer sequence you'd expect the agent to produce, and say which step is where a badly-prompted model would go wrong.

---

## 5. LLM orchestration with local models (Ollama)

**What it is:** running open-source LLMs (Llama, Qwen, Mistral) locally via Ollama, and calling them over a local HTTP API instead of a hosted provider.

**Why this assignment needs it:** Requirement 3 wants two distinct models the router can choose between — free, no API keys, no rate limits, and it's what makes the RL bandit's choice meaningful (two models that actually behave differently).

**Understand cold:**
- **Ollama's API shape**: it exposes `/api/generate` and `/api/chat` over localhost; you send a prompt (and optionally a `format: "json"` flag), it streams or returns text back.
- **Why smaller local models need stricter prompting**: a 3B model is far less reliable at "just follow the instructions" than a hosted frontier model — you compensate with a strict system prompt, one worked example (few-shot), and a retry-on-parse-failure strategy, rather than assuming perfect compliance.
- **Model selection as a routing decision, not a hardcoded choice**: the whole point of Requirement 4 is that *which model answers* is learned, not fixed — so orchestration code needs to treat "which LLM" as a parameter passed in from the bandit, not a constant.

**Checkpoint:** you can explain why you'd retry a malformed JSON response once before giving up (cost of one retry vs. cost of silently failing the whole request), and why that's different from retrying indefinitely.

---

## 6. Reinforcement learning — contextual bandits

**What it is:** a *much* smaller idea than "RL" usually implies. No neural network, no simulated environment. A bandit tracks, per **state** (context), a running average reward for each possible **action** (arm), and picks actions to balance trying new things (**explore**) against using what's worked (**exploit**).

**Why this assignment needs it:** this is Requirement 4, and the assignment explicitly calls out RL test coverage as "the layer most candidates skip, and the one we look at closest" — this is worth understanding properly, not glossing over.

**Understand cold:**
- **State/context**: the situation the bandit is choosing an action *for*. Here: the query's triage class (`lookup` / `howto` / `incident_urgent`). Different states can have different "best" actions — that's what makes it *contextual* rather than a single global bandit.
- **Action/arm**: the thing being chosen. Here: which LLM to use.
- **Reward**: a number that says how good that choice turned out to be. Here: `feedback×10 − latency − hallucination_penalty`. You need to be able to explain *why each term is signed the way it is* — feedback is the only positive term because it's the only signal that says "this genuinely helped"; latency and hallucination are penalties because they're costs.
- **Epsilon-greedy**: with small probability ε (e.g. 15%), pick a random arm regardless of its track record (explore); otherwise pick the arm with the best running average for this state (exploit). This is the simplest possible answer to the exploration/exploitation trade-off — you don't need Thompson sampling or UCB for this assignment, but you should know they exist as more sophisticated alternatives.
- **Incremental update (running average) — the actual math:**
  `Q_new = Q_old + α × (reward − Q_old)`
  Read this as: "nudge my estimate toward the new observation, by a step size α." If α = 1/N (N = number of times this arm has been picked in this state), this becomes the exact running average — worth being able to derive by hand for 2–3 trials, since that's exactly what your unit tests will assert.
- **Why the update is asynchronous**: the reward formula needs human feedback, which arrives later (via a separate endpoint) than the query itself. This means "select an action" and "learn from the outcome" are two different code paths firing at two different times — a detail that trips people up when writing the bandit's tests.

**Checkpoint:** given a starting `Q=5.0, N=3` for an arm, and a new reward of `8.0`, you can compute the updated `Q` by hand using `α = 1/N`, and explain in one sentence why ε=0 would make the bandit stop learning about arms it hasn't tried yet.

---

## 7. Hallucination mitigation & groundedness

**What it is:** techniques for catching an LLM answer that *sounds* right but isn't actually supported by the evidence it was given, before that answer reaches a user.

**Why this assignment needs it:** Requirement 5 — and it's the difference between "a chatbot" and "a support agent people can trust with production incidents."

**Understand cold:**
- **Groundedness / entailment (concept, not the fancy NLI-model version)**: does the retrieved evidence actually *support* the claims in the answer? The cheap proxy this assignment uses is lexical overlap — literally, how many of the same significant words appear in both the answer and the cited evidence.
- **Jaccard similarity**: `|A ∩ B| / |A ∪ B|` — the overlap between two sets of words, divided by their combined size. Simple, cheap, and good enough to be a real, testable signal (not a decorative one).
- **Citation validity as a *second*, stricter check**: even a decent lexical-overlap score doesn't prove the model actually used the evidence it *claims* to have used — so you separately verify that every citation the model emits actually refers to a chunk/field that was really retrieved for this query.
- **Why "I don't know" has to be a real code path, not a prompt instruction**: you cannot trust an LLM's self-restraint. The check has to be enforced in code *after* generation — if it fails, the API overrides the model's text with a fixed escalation message, unconditionally.
- **The hallucination penalty feeding back into RL**: this is what closes the loop — a model/path combination that hallucinates more should, over time, get chosen less, *because it's directly penalized in the reward,* not because you hardcoded a rule against it.

**Checkpoint:** you can explain the difference between "the answer failed the groundedness check" and "the answer failed the citation-validity check," and why you need both rather than just one.

---

## 8. Classical ML — logistic regression & evaluation

**What it is:** the "no deep learning allowed" classifier requirement. Logistic regression predicts a category (here: `lookup` / `howto` / `incident_urgent`) from a handful of numeric/boolean features, by learning a weight (coefficient) for each feature.

**Why this assignment needs it:** Requirement 6, and its output becomes the RL bandit's state — so a broken classifier quietly breaks the RL layer too.

**Understand cold:**
- **Features vs. labels**: features are the inputs you can compute cheaply from a raw query (length, regex flags, keyword flags); the label is the category you're trying to predict. You need to be comfortable turning "a query string" into "a row of numbers" before any model touches it.
- **Why standardize features first**: features on wildly different scales (e.g. `char_length` in the hundreds vs. a boolean 0/1 flag) will make raw coefficients incomparable — you subtract the mean and divide by standard deviation so coefficients are on the same footing, which also matters for explainability (Requirement 7 needs "this feature mattered more than that one" to be a fair comparison).
- **Softmax for multi-class**: logistic regression is naturally binary; for 3 classes you generalize it (multinomial/softmax) so it outputs a probability for each class, and you take the highest. You don't need to derive the formula — you need to know it turns raw scores into probabilities that sum to 1.
- **Train/test split**: you evaluate on data the model didn't see during training (e.g. 80/20 split), because accuracy on training data tells you almost nothing about whether the model generalizes.
- **Accuracy vs. F1 vs. confusion matrix**: accuracy alone hides class imbalance problems (a model that always predicts the majority class can look "accurate"). F1 balances precision (of what I predicted as X, how much was really X) and recall (of everything that was really X, how much did I catch). The confusion matrix shows you *which* classes get confused with each other — this is what your 2–3 sentences of interpretation should actually reference, not just restate the accuracy number.
- **Coefficients as explanations**: for a standardized feature, a larger positive coefficient means "this feature pushes hard toward this class." Multiplying a coefficient by *this query's* standardized feature value gives you a per-prediction contribution — that's what lets you say "flagged as urgent because of X" for one specific answer, not just in general.

**Checkpoint:** given a small confusion matrix (3×3), you can point to the largest off-diagonal number and explain what real-world query confusion it represents.

---

## 9. Explainable AI — for user confidence, not model audits

**What it is:** surfacing *just enough* of the system's decision process that a human operator can sanity-check it, without pretending to fully explain how an LLM "thinks."

**Why this assignment needs it:** Requirement 7 — and it's explicitly scoped down ("full LLM interpretability is out of scope"), so the skill being tested is judgment about *what's worth explaining*, not exhaustive transparency.

**Understand cold:**
- **The difference between a deterministic decision and a model's internal reasoning**: your router rule, your bandit's arm choice, your classifier's top features, and your groundedness score are all things you can explain *exactly and truthfully*, because you built them. The LLM's actual reasoning process is not — so explanations should lean on the parts you actually control.
- **Local vs. global explanation**: "this specific prediction was driven by these two features" (local, what an operator needs) is different from "in general, this feature matters most across all data" (global, an internal/engineering concern). Requirement 7 wants local.
- **Confidence bands over raw scores**: a High/Medium/Low label communicates faster and more honestly to a non-ML operator than a bare float, *because* the float implies a precision (calibrated probability) you haven't actually established.

**Checkpoint:** you can write, in one sentence each, the explanation an operator would see for a given transaction — routing reason, model-choice reason, confidence — without using the words "vector," "cosine," "epsilon," or "coefficient."

---

## 10. Frontend — Next.js App Router + data fetching

**What it is:** React's server/client component model as implemented by Next.js's App Router, plus a data-fetching library (SWR) for polling the API and keeping UI state in sync.

**Why this assignment needs it:** Requirement 8 — a console showing live transactions and letting an operator act on them (feedback buttons that actually do something).

**Understand cold:**
- **Server vs. client components**: in the App Router, components are server-rendered by default (no JS shipped, can't use hooks like `useState`); anything interactive (buttons, forms, polling) must be explicitly marked `"use client"`. You need to know which of your components need this and why.
- **SWR's core idea**: you declare "this data lives at this key (URL)," SWR handles fetching, caching, and re-fetching on an interval — you get a table that stays live without writing your own polling loop by hand.
- **Optimistic updates**: when a user clicks 👍, you update the UI *immediately* (assuming success) rather than waiting for the round trip — makes the feedback button feel responsive, and matters because the assignment explicitly calls out "no dead buttons."
- **Why a chart of RL behavior needs to be legible, not decorative**: the assignment says "functional and legible beats polished" — a bar chart of arm-selection counts and a line chart of reward trend are enough; you're not being graded on chart aesthetics.

**Checkpoint:** you can explain why the feedback button component needs `"use client"` but the page's initial transaction table render doesn't strictly require it.

---

## 11. Testing — unit, API, and one frontend test

**What it is:** automated tests that assert behavior, not just "the code runs."

**Why this assignment needs it:** Requirement 10, with an explicit warning that RL tests are the most commonly skipped and most closely scrutinized part.

**Understand cold:**
- **Unit test vs. integration/API test**: a unit test calls a function directly (e.g. the bandit's update function) with known inputs and asserts an exact output. An API test sends an HTTP request through the whole route and asserts on the response — broader, slower, but catches wiring bugs a unit test can't.
- **Testing math, not just "it doesn't crash"**: for the bandit, a real test gives a known starting `Q`/`N` and reward, and asserts the *exact* resulting `Q` — this is the difference between a test that proves the formula is implemented correctly and one that just proves the function is callable.
- **Mocking an unavailable dependency**: simulating "Ollama is down" without actually needing Ollama down — you substitute a fake client that throws/returns an error, and assert the API degrades gracefully (still returns a sane response) instead of 500ing.
- **Why one frontend test is enough here**: the assignment wants proof you *can* test frontend behavior, not full coverage — a single test that clicking feedback triggers the right API call and UI update satisfies the letter and spirit of the requirement.

**Checkpoint:** you can describe, for the bandit test, the exact three numbers you'd assert on (state, arm, resulting Q) and why a test that only checks "no error was thrown" wouldn't actually catch a broken update formula.

---

## 12. CI/CD — GitHub Actions & Docker

**What it is:** Actions runs your lint/test/build commands automatically on every PR; Docker packages your app into a portable, reproducible container image.

**Why this assignment needs it:** Requirement 9 — and "reproducibility" is also called out separately in the deliverables (anyone should be able to run this anywhere).

**Understand cold:**
- **Workflow triggers and jobs**: a workflow runs on events (`on: [pull_request, push]`); it's made of jobs that can run in parallel or be chained with `needs:` (e.g. `deploy` needs `test` to pass first).
- **Why failing fast matters**: a lint or test failure should stop the pipeline before a build/deploy step wastes time — this is *why* jobs are chained with `needs`, not just a stylistic choice.
- **Branch-gating a job**: `if: github.ref == 'refs/heads/main'` restricts a job (the mock deploy) to only run on the main branch, so PRs get tested/built but never "deployed."
- **Multi-stage Dockerfiles**: a first stage installs dependencies and builds the app; a second, smaller stage copies only the built output — keeps the final image lean and is the standard pattern for Node apps, worth understanding even if you write a simpler single-stage version first.

**Checkpoint:** you can explain, for your own workflow file, exactly what would make the `deploy` job *not* run — both a failing test and a non-main branch should independently stop it.

---

## 13. SRE & observability

**What it is:** the practices that let you tell, in production, whether the system is healthy, how it's behaving, and why — before a user has to tell you first.

**Why this assignment needs it:** Requirement 11, and it's the one that most directly maps to "production-ready" versus "notebook with an API bolted on."

**Understand cold:**
- **Structured (JSON) logging with correlation IDs**: every log line is a JSON object, and every line related to one request carries the same `transaction_id` — this is what lets you reconstruct "everything that happened for this one query" from a pile of otherwise-interleaved logs.
- **A real health check vs. a hardcoded 200**: `/health` has to actually probe its dependencies (ping Ollama, check the vector store is loaded) and report failure truthfully — a hardcoded 200 is worse than no health check, because it actively lies during an incident.
- **Liveness vs. readiness (concept)**: liveness asks "is the process alive at all," readiness asks "is it able to serve real traffic right now" — your `/health` here is closer to a readiness check, since it's about whether dependencies are usable, not just whether the process is running.
- **The Prometheus text exposition format**: a simple, well-known plain-text format (`metric_name{label="value"} 42`) that monitoring tools already know how to scrape — you're not inventing a metrics format, you're conforming to the one everything else expects.
- **Graceful degradation**: when a dependency is down, the system does something *deliberately worse but still useful* (fall back to vectorless-only, or a clearly labeled degraded response) instead of throwing an unhandled exception. This has to be designed in, not left to whatever happens to occur when an `await` rejects.

**Checkpoint:** you can describe, for your own system, what specifically breaks (and what error a user would see) if Ollama is stopped while the API keeps running — and confirm that answer is "a degraded but valid response," not "a 500."

---

## Suggested learning order

If you're learning these mostly from scratch rather than refreshing, this order tracks the dependency chain (each layer leans on the one before it) and matches the 72-hour roadmap in the plan doc:

1. Hono API basics → 2. Vectorless retrieval → 3. RAG/embeddings → 4. ReAct/tool-calling → 5. Ollama orchestration → 6. Bandits/RL → 7. Hallucination checks → 8. Logistic regression/metrics → 9. Explainability → 10. Next.js/SWR → 11. Testing → 12. CI/CD → 13. SRE/observability

Sections 1–5 are what you need before Day 1 output is meaningful; 6–9 before Day 2; 10–13 before Day 3.
