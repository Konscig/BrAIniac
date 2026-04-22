---
title: Automated Quantitative Evaluation Service
status: Draft
created: 2026-04-22
feature_branch: 001-evaluation-service
---

# Feature Specification: Automated Quantitative Evaluation Service

**Feature Branch**: `001-evaluation-service`
**Created**: 2026-04-22
**Status**: Draft
**Input**: Automated quantitative evaluation of agent pipelines against a reference dataset, per constitution principle V. Formal basis: [docs/math_evaluation_draft.md](../../docs/math_evaluation_draft.md); metric catalogue and selection rules: [docs/math_metric_catalog_draft.md](../../docs/math_metric_catalog_draft.md).

## Context & Motivation *(informational)*

BrAIniac's constitution principle V ("Automated Quantitative Evaluation") demands that every pipeline the platform produces be judged by a deterministic scoring procedure that maps `(pipeline, dataset)` to a scalar quality score `S ∈ [0, 1]` plus a categorical verdict, without a human-in-the-loop. The formal model is already fixed:

- `S = Σ_{j ∈ M'} w_j · S_j`, with `M' ⊆ M` chosen by pipeline shape and `Σ w_j = 1`.
- Per-metric score `S_j = (1/m) · Σ_k f_j(a(x_k), y_k)`, with all `f_j` normalised to `[0, 1]` (higher = better).
- Hard operational gates `T_max`, `C_max`, `R_fail_max` that override `S` when exceeded.
- A safety floor that caps `S ≤ 0.59` when any enabled safety metric falls below its threshold.
- Verdict bands: `S < α_rework (0.6)` → rework; `α_rework ≤ S ≤ α_pass (0.8)` → acceptable with improvements; `S > α_pass` → pass.

This spec covers the **business-level behaviour** of that evaluator as a pipeline-owner-facing service. Implementation decisions (judge prompts, execution topology, persistence) belong to the plan; this document constrains *what* the user gets and *how it must behave*, not *how it is built*.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Pipeline owner asks "is my pipeline good enough?" (Priority: P1)

A pipeline owner has built and deployed a BrAIniac pipeline `a` and uploaded a reference dataset `D = {(x_k, y_k)}`. They request an evaluation; the system runs the pipeline across every dataset row, computes a score `S` and per-metric breakdown, applies operational gates and safety floor, and returns a verdict (`rework` / `acceptable_with_improvements` / `pass` / `rejected_by_operational_gate` / `rejected_by_safety_floor`). No human rater is involved at any step.

**Why this priority**: This is the entire raison d'être of the feature — without it, principle V is unsatisfied and the platform has no answer to "does this pipeline work well enough to ship?". Every other story below is a refinement of this one.

**Independent Test**: Given a pipeline with at least one `LLMCall` and a small dataset (≥3 rows) containing `(x_k, y_k)` pairs, the owner triggers an evaluation and receives, within reasonable time, a report containing a scalar `S`, a verdict, and a per-metric breakdown, where the breakdown references only metrics applicable to the pipeline's node shape.

**Acceptance Scenarios**:

1. **Given** an owner-held pipeline and a dataset they own, **When** the owner requests an evaluation with default settings, **Then** the system produces a report containing `S ∈ [0, 1]`, a verdict, and per-metric scores `S_j` with weights `w_j` where `Σ w_j = 1`.
2. **Given** a pipeline whose average run cost exceeds `C_max`, **When** the evaluation finishes, **Then** the verdict is `rejected_by_operational_gate` irrespective of the numeric `S`, and the offending gate (`C(a) > C_max`) is called out in the report.
3. **Given** a pipeline whose evaluation score is `S = 0.72`, **When** the evaluation finishes and no gates trip, **Then** the verdict is `acceptable_with_improvements` and the report lists the lowest-contributing metrics as "weakest links".
4. **Given** a pipeline missing any `LLMCall`/`AgentCall`/`Ranker`/`Parser` of relevance to a metric, **When** the evaluator selects `M'`, **Then** only applicable metrics are included and `Σ w_j` is re-normalised to 1.

---

### User Story 2 — System automatically picks the right metrics (Priority: P1)

Before running anything, the evaluator inspects the pipeline's node composition (plus optional dataset flags like "has retrieval labels", "output is structured", "safety required") and selects `M'` automatically using the rules in [docs/math_metric_catalog_draft.md](../../docs/math_metric_catalog_draft.md#2-правила-автоматического-выбора-m). The owner does not have to know metric names to get a meaningful score.

**Why this priority**: Without automatic selection, every evaluation requires the owner to understand 26 metrics — this is the opposite of "automated quantitative evaluation". Defaulting to a sensible `M'` is what makes the service usable out-of-the-box.

**Independent Test**: For three representative pipeline shapes (pure-LLM, RAG, agent-with-tools), evaluating with default settings produces a distinct, correct `M'`: pure-LLM gets no `context_*` metrics; RAG gets `context_*` and `faithfulness`; agent gets `task_completion`, `tool_correctness`, `plan_step_efficiency`.

**Acceptance Scenarios**:

1. **Given** a pipeline containing `DatasetInput + LLMCall`, **When** evaluation starts, **Then** `M'` includes `context_precision`, `context_recall`, `context_relevance`, `faithfulness`, plus the base set.
2. **Given** a pipeline containing `AgentCall` with `ToolNode`, **When** evaluation starts, **Then** `M'` includes `task_completion`, `tool_correctness`, `tool_success_rate`, `plan_step_efficiency`.
3. **Given** a pipeline without a `Ranker` node or without retrieval labels in the dataset, **When** evaluation starts, **Then** `M'` excludes `retrieval_ndcg_at_k` and `retrieval_mrr`.
4. **Given** the owner overrides `M'` to add a metric whose required telemetry is missing (e.g. `tool_correctness` without `ToolNode`), **When** evaluation starts, **Then** the system either declines that override with a clear reason OR degrades that metric to `skipped` in the report rather than producing a misleading score.

---

### User Story 3 — Owner can tune weights via presets or manual weights (Priority: P2)

Owners whose use-case matches one of the built-in presets (`uniform`, `rag_heavy`, `agent_heavy`, `pure_llm`) can select the preset; advanced owners can supply per-metric weights directly. In both cases the system validates the weights, normalises them so `Σ w_j = 1`, and includes the effective `W` in the report.

**Why this priority**: The default weight choice materially affects the verdict; owners disagree on what matters. This is P2 because the system is still useful with `uniform` weights alone — but without presets, every owner has to either accept a potentially-misleading uniform weighting or hand-craft weights.

**Independent Test**: Evaluating the same pipeline under `uniform` and `rag_heavy` presets yields the same per-metric `S_j`, different `w_j`, and potentially a different `S` / verdict — the report explains which preset produced which weights.

**Acceptance Scenarios**:

1. **Given** the owner selects preset `rag_heavy` and `M'` contains some but not all preset-listed metrics, **When** evaluation runs, **Then** the weights of the metrics absent from `M'` are dropped and the remaining weights are re-normalised so `Σ = 1`.
2. **Given** the owner supplies manual weights whose sum is not 1, **When** evaluation starts, **Then** the weights are normalised to sum to 1 and the normalised values are reflected in the report.
3. **Given** the owner supplies a weight for a metric not in `M'`, **When** evaluation starts, **Then** the surplus weight is rejected with a clear reason OR silently ignored, but never silently re-assigned to another metric.

---

### User Story 4 — Owner can inspect per-metric, per-row, per-node breakdown (Priority: P2)

The final report is not just a single number. It contains, at minimum: `S`, verdict, effective `M'` and `W`, each `S_j` with its normalised weight, per-row scores for deterministic and LLM-as-a-Judge metrics, per-node aggregates (which node dragged the score down), operational gate actuals vs. thresholds, and — when safety is enabled — safety metric scores against the floor.

**Why this priority**: A single `S` without a breakdown can tell the owner *whether* to rework but not *what* to rework. Diagnosability (`weakest_link`) is what turns the verdict into an actionable signal.

**Independent Test**: Given a pipeline where one specific node produces poor output on all rows while the rest perform well, the report's per-node aggregate identifies that node as the weakest link and the per-metric breakdown shows which metric(s) flagged it.

**Acceptance Scenarios**:

1. **Given** a completed evaluation, **When** the owner opens the report, **Then** they see `S`, verdict, `M'` with each `(name, kind, scope, s_j, w_j)`, operational summary `(t_avg, c_avg, r_fail)` versus `(T_max, C_max, R_fail_max)`, and for each per-row judge invocation, the raw row-level score.
2. **Given** an evaluation with `safety_required=true`, **When** `toxicity_score < 0.9` on any row, **Then** the report surfaces the violating row(s) and the safety-floor verdict takes precedence over the quality band.
3. **Given** a finished evaluation, **When** the owner asks a second time for the same evaluation id, **Then** the report is returned from storage and is byte-identical to the original (the report is a persisted snapshot, not a recomputation).

---

### User Story 5 — Owner can compare two evaluations of the same pipeline over time (Priority: P3)

Running evaluations is only valuable if the owner can see whether a change they made *improved* the pipeline. The service exposes a list of past evaluations for a given pipeline ordered by recency, each identified by timestamp, `S`, verdict, and the git-like identity of `(pipeline_version, dataset_version, M', W)` that produced it.

**Why this priority**: The primary value (getting a score) is already delivered by P1. History is a refinement: it makes the service useful for iteration rather than single-shot measurement. Marked P3 because an owner can achieve the same via external bookkeeping in the short term.

**Independent Test**: Given two evaluations of the same pipeline taken a day apart, the owner can list both, see both `S` values, and determine which is newer.

**Acceptance Scenarios**:

1. **Given** several prior evaluations of pipeline `a`, **When** the owner lists evaluations for `a`, **Then** they see each evaluation's id, timestamp, verdict, `S`, and the dataset id used.
2. **Given** an evaluation list with ≥ 1 entry, **When** the owner requests any prior evaluation by id, **Then** the full original report is returned unchanged (no re-computation, no drift).

---

### Edge Cases

- **Empty dataset (`m = 0`)** — the evaluator refuses to produce a score; verdict is `rejected_invalid_input` with a clear message, not `S = 0`.
- **Dataset row fails to execute** (pipeline raises or times out) — the failing row contributes to `R_fail(a)` and is excluded from `S_j` averaging; the report shows how many rows were excluded.
- **All rows fail** — `R_fail(a) = 1.0`, operational gate trips, verdict is `rejected_by_operational_gate`; the report explains no per-metric score can be computed.
- **Judge LLM returns unparseable / invalid JSON** on a specific row — that row's judge-produced metric is retried per the retry policy; if still unparseable, the row is marked `skipped` for that metric, counted against diagnostic information in the report, but does not crash the whole evaluation.
- **Judge LLM upstream (OpenRouter) returns 429/503** — retry with backoff per runtime snapshot (docs/sdd/09); if exhausted, the evaluation is marked `partial` with a retry hint, never silently shows `S` computed from incomplete data.
- **`M'` collapses to the empty set** (e.g. only runtime-auto metrics remain and the owner disabled them all) — the evaluator refuses to produce `S`; verdict is `rejected_invalid_input`.
- **Pipeline owner is not the dataset owner** — evaluation is refused on ownership grounds.
- **Same `(pipeline_version, dataset_version)` evaluated twice concurrently** — second request is either queued or returns the in-flight evaluation id; the system MUST NOT produce two inconsistent reports.
- **`error_rate_score`** is [always part of `M'`](../../docs/math_metric_catalog_draft.md#ручной-override) and cannot be disabled by the owner.

---

## Requirements *(mandatory)*

### Functional Requirements

**Initiating and running evaluations**

- **FR-001**: The system MUST allow the authenticated owner of a pipeline `a` and a compatible dataset `D` to start an evaluation of `(a, D)` without any human rating step.
- **FR-002**: The system MUST execute the pipeline once per dataset row `(x_k, y_k) ∈ D`, collecting output `O_k = a(x_k)` plus runtime telemetry (duration, cost, tokens, status, per-node outputs where relevant).
- **FR-003**: The system MUST refuse to start an evaluation when the caller does not own either the pipeline or the dataset, or when the dataset is empty, using a non-side-effecting rejection.

**Metric selection (`M'`)**

- **FR-004**: The system MUST derive `M' ⊆ M` automatically from the pipeline's node set and optional dataset flags, using the rules in [docs/math_metric_catalog_draft.md §2](../../docs/math_metric_catalog_draft.md#2-правила-автоматического-выбора-m).
- **FR-005**: The system MUST always include `error_rate_score` in `M'`, and MUST NOT let the owner remove it.
- **FR-006**: The system MUST let the owner add metrics from `M \ M'` or remove any auto-selected metric other than `error_rate_score`. When a chosen metric lacks required telemetry, the system MUST either reject that override with an explanation or mark the metric as `skipped` in the report — it MUST NOT silently substitute a different metric.
- **FR-007**: The system MUST prevent duplicate metric families (e.g. `faithfulness` vs `hallucination_rate`, `answer_similarity` vs `answer_similarity_string`) from both being counted toward `S`; selection MUST follow the priority rules in the catalogue.

**Weights (`W`)**

- **FR-008**: The system MUST support a default of `uniform` weights and named presets `rag_heavy`, `agent_heavy`, `pure_llm`, with preset handling that restricts each preset to the metrics actually present in `M'` and re-normalises the remaining weights so `Σ w_j = 1`.
- **FR-009**: The system MUST accept per-metric manual weights, validate them (all finite, non-negative, assigned only to metrics in `M'`), and normalise to sum to 1 before use.
- **FR-010**: The final report MUST include the effective `W` actually used for aggregation (the post-normalisation values), not the owner-supplied raw values.

**Score and verdict**

- **FR-011**: The system MUST compute `S_j` as the arithmetic mean over non-skipped rows of `f_j(a(x_k), y_k) ∈ [0, 1]`, and `S = Σ w_j · S_j`, rounded to at least three decimal places in the report.
- **FR-012**: The system MUST derive the quality verdict from default thresholds `α_rework = 0.6`, `α_pass = 0.8` (both MUST be configurable per-project and per-evaluation): `S < α_rework` → `rework`, `α_rework ≤ S ≤ α_pass` → `acceptable_with_improvements`, `S > α_pass` → `pass`.
- **FR-013**: The system MUST enforce operational hard gates independently of `S`: if `T(a) > T_max`, `C(a) > C_max`, or `R_fail(a) > R_fail_max`, the verdict MUST be `rejected_by_operational_gate` regardless of `S`, and the offending gate(s) MUST be identified in the report.
- **FR-014**: The system MUST enforce a safety floor when any `safety_*` metric is enabled: if any such metric falls below its threshold (defaults `toxicity_score ≥ 0.9`, `bias_score ≥ 0.9`, `pii_leak_score ≥ 0.95`), the verdict MUST be `rejected_by_safety_floor` and `S` MUST be capped at `0.59` in the report.
- **FR-015**: The operational gate verdict MUST take precedence over the safety-floor verdict, which MUST take precedence over the quality-band verdict.

**LLM-as-a-Judge**

- **FR-016**: The system MUST route all judge LLM calls through the platform's standard LLM adapter (no direct vendor SDK usage).
- **FR-017**: The judge model used for evaluation MUST be configurable and SHOULD default to a model distinct from any model under evaluation in the pipeline to reduce self-bias.
- **FR-018**: When a judge call returns a malformed or off-schema response, the system MUST retry per the retry policy (see [Assumptions](#assumptions)); if retries are exhausted, the corresponding row-metric MUST be marked `skipped` and counted in the diagnostics — it MUST NOT be silently treated as `0` or `1`.
- **FR-019**: The system MUST NOT reveal the expected answer `y_k` to the judge when evaluating metrics whose catalogue definition forbids it (e.g. `faithfulness`, `coherence`); conversely it MUST include `y_k` for metrics that require ground truth (e.g. `e2e_correctness`, `context_recall`).

**Report and persistence**

- **FR-020**: The system MUST produce an `EvaluationReport` containing at minimum: evaluation id, pipeline id and version identifier, dataset id and version identifier, `M'`, effective `W`, per-metric results `(name, kind, scope, s_j, w_j, per_row[])`, per-node aggregates where `scope` is node-level, operational summary (`t_avg`, `c_avg`, `r_fail` with their thresholds), safety summary (when enabled), final `S`, verdict, verdict reason, and a `weakest_link` pointing at the metric(s) or node(s) with largest negative contribution to `S`.
- **FR-021**: The system MUST persist every completed report in durable storage and MUST return the byte-identical stored report on any subsequent read of the same evaluation id.
- **FR-022**: The system MUST expose a list of prior evaluations for a given pipeline in reverse-chronological order, each carrying evaluation id, timestamp, verdict, `S`, dataset id, and the set of thresholds used.

**Concurrency and idempotency**

- **FR-023**: When the same owner starts an evaluation for the same `(pipeline_version, dataset_version, M', W, thresholds)` quintuple while an earlier evaluation is still in-flight, the system MUST return the in-flight evaluation id rather than start a duplicate run.
- **FR-024**: An in-progress evaluation MUST expose a status (`queued`, `running`, `complete`, `failed`, `partial`) that the owner can poll.

**Compliance and auditability**

- **FR-025**: The system MUST record the configuration used for each evaluation (`M'`, `W`, all thresholds, judge model identifier, retry policy) inside the stored report such that re-reading the report answers "under what rules was this judged?" without consulting external state.

### Key Entities

- **Pipeline (`a`)** — the bounded directed graph being evaluated, identified by id and version. Outside this spec's scope to mutate; it is strictly an input.
- **Dataset (`D`)** — an ordered set of rows `(x_k, y_k)` with optional per-row metadata (`ctx`, `retrieval_labels`, `expected_tool_calls`, `schema`, `regex`), owned by a user. Identified by id and version. Also strictly an input.
- **Metric (`f_j ∈ M`)** — catalogue-defined function `(inputs) → [0, 1]`, with declared `kind` (`auto` / `det` / `embed` / `J`), `scope` (`global` | `node(NodeType)`), and `requires` (fields it needs). Drawn from [docs/math_metric_catalog_draft.md §1](../../docs/math_metric_catalog_draft.md#1-множество-m).
- **Applied metric set (`M'`)** — the subset of `M` actually used for this evaluation, derived from pipeline shape and dataset flags (§2 of the catalogue), with owner overrides allowed per FR-006.
- **Weight vector (`W`)** — per-metric weights `{w_j}_{j ∈ M'}` with `Σ w_j = 1`, originating from `uniform`, a preset, or manual owner input.
- **Thresholds** — quality thresholds `(α_rework, α_pass)` and operational thresholds `(T_max, C_max, R_fail_max)`, both with MVP defaults that may be overridden per-project/per-evaluation.
- **Safety configuration** — optional enablement of `toxicity_score`, `bias_score`, `pii_leak_score` with per-metric floor values (defaults 0.9 / 0.9 / 0.95).
- **Evaluation run** — one execution of the pipeline over the whole dataset plus metric computation. Has a status, a start and end timestamp, and produces exactly one report on success or `partial` state.
- **Evaluation report** — the persisted, read-only output described in FR-020. The unit of truth the owner consumes.
- **Weakest link** — a diagnostic pointer: either a metric `f_j` with the largest `w_j · (1 − S_j)` contribution, or a node `v ∈ V_a` with the worst per-node aggregate.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pipeline owner can go from "pipeline deployed + dataset uploaded" to "evaluation report in hand" in a single request, without any further human judgement step, for at least 95 % of happy-path evaluations.
- **SC-002**: For the three reference pipeline shapes (pure-LLM, RAG, agent-with-tools), the automatically-chosen `M'` matches the catalogue's rules exactly — verifiable by an automated fixture test on each shape.
- **SC-003**: When thresholds `T_max` / `C_max` / `R_fail_max` are violated, the verdict is `rejected_by_operational_gate` in 100 % of cases, regardless of `S` — i.e. there is zero leakage of "passed" verdicts on operationally-failing pipelines.
- **SC-004**: An evaluation report fetched twice for the same evaluation id returns byte-identical content in 100 % of cases (persistence contract).
- **SC-005**: The `weakest_link` diagnostic points at a node or metric that, if improved to a perfect `S_j = 1`, would raise the overall `S` by at least as much as improving any other single metric or node — i.e. it correctly identifies the highest-leverage target.
- **SC-006**: For each judge-backed metric, the median per-row judge call completes within an owner-reasonable latency window and never silently treats unparseable output as `0` or `1` — verifiable by inspection of the report diagnostics.
- **SC-007**: The system never produces two inconsistent completed reports for the same `(pipeline_version, dataset_version, M', W, thresholds)` input — concurrency deduplication is observable.
- **SC-008**: Every stored report is fully self-describing: reading only the report tells you exactly which metrics, weights, thresholds, and judge model produced the verdict.

---

## Assumptions

- **Judge retry policy**: the system applies a bounded retry with exponential backoff for transient judge-LLM failures (including OpenRouter 429/503 documented in [docs/sdd/09](../../docs/sdd/09-backend-runtime-truth-snapshot.md)); the exact numeric bounds (max retries, backoff curve) are an implementation detail set in the plan, not in this spec.
- **Judge ensembling**: MVP uses a single-judge call per (row, metric). Multi-judge ensembling (median, trimmed mean) is out of scope for v1 and listed as a follow-up in the catalogue's open questions.
- **Reference values** for normalisation (`T_ref`, `C_ref`, `tokens_ref`) default to the catalogue's §4 values (10 s, $0.01, 4 000 tokens) and are the same source of truth used to normalise `latency_score`, `cost_score`, `token_efficiency`.
- **Threshold defaults** (`α_rework`, `α_pass`, `T_max`, `C_max`, `R_fail_max`, safety floors) follow the MVP defaults in [docs/math_metric_catalog_draft.md §4](../../docs/math_metric_catalog_draft.md#4-дефолты-порогов); they are calibration stubs, not immutable values, and the implementation MUST expose per-project and per-evaluation overrides.
- **Dataset schema** is fixed by the existing `DatasetInput` node contract in [docs/sdd/07-mvp-node-catalog.md](../../docs/sdd/07-mvp-node-catalog.md); no dataset format changes are within scope of this feature.
- **Existing skeleton**: the type contract in [backend/src/services/application/evaluation/evaluation.types.ts](../../backend/src/services/application/evaluation/evaluation.types.ts) and the three `501 Not Implemented` handlers in [evaluation.service.ts](../../backend/src/services/application/evaluation/evaluation.service.ts) are treated as the starting surface; later plan tasks MAY tighten or extend those types but MUST NOT silently diverge.
- **Pipeline execution substrate**: the evaluator reuses the platform's pipeline execution pipeline (RunTask + snapshots in `backend/.artifacts/`) and does not invent a parallel runner.
- **No human rater**: throughout this feature, "evaluation" strictly means machine-produced judgement; introducing human-in-the-loop rating is explicitly out of scope and belongs to a separate feature.
- **Legacy `judge-agent` branch** is used strictly as a *reference* for the tool-using judge pattern (Mistral-based prototype). The new judge routes through the standard LLM adapter and does not import legacy code verbatim — the prototype is unversioned and uses a direct vendor SDK forbidden by [CLAUDE.md](../../CLAUDE.md) conventions.

---

## Out of Scope

- Human-in-the-loop rating, rater consensus UIs, rater disagreement resolution.
- Pipeline *mutation* based on evaluation results (e.g. auto-tuning weights, auto-editing the graph) — evaluation is read-only.
- Dataset authoring / upload / validation flows — inputs only.
- Cross-pipeline comparison or leaderboards — out of MVP scope.
- Calibration of `T_max`, `C_max`, `R_fail_max` from observed runs — calibration is a separate follow-up.
- Multi-judge ensembling.
- Red-teaming / adversarial dataset generation.

---

## Open Questions *(non-blocking — carry forward to `/speckit.clarify`)*

None of the following block implementation planning, but should be resolved before `/speckit.tasks`:

- Exact judge retry bounds (max attempts, backoff curve).
- Whether owner overrides of `M'` that lack telemetry (FR-006) should be *rejected* up-front or *accepted-and-skipped-with-diagnostic*. Both are acceptable from a correctness standpoint; the choice is UX.
- Presentation layer for `weakest_link` (single pointer vs ranked top-k) — affects the report schema.

---

## Constitution Alignment

- **Principle V (Automated Quantitative Evaluation)**: this feature is the platform-level realisation of the principle.
- **Principle III (Bounded Directed Graphs, not DAGs)**: the evaluator treats pipelines as inputs and does not impose a DAG constraint; cycles with `loop.maxIterations` are handled transparently by the execution substrate.
- **"Higher is better on [0, 1]"**: every metric in the report MUST follow this convention; safety metrics invert problem-presence accordingly (catalogue §1).
- **Weights sum to 1**: enforced by FR-008/FR-009/FR-010 at report time.
- **Operational gates are hard and independent of S**: enforced by FR-013/FR-015.
- **All LLM calls via the standard adapter**: enforced by FR-016.
