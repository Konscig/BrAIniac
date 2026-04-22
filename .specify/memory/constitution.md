<!--
SYNC IMPACT REPORT
------------------
Version change: none → 1.0.0 (initial ratification)
Modified principles: none (all principles newly introduced)
Added sections:
  - Core Principles (I–V)
  - Technology & Architecture Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: none
Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ updated (Constitution Check gates filled in)
  - .specify/templates/spec-template.md — ✅ no changes required (constitution adds no mandatory spec sections)
  - .specify/templates/tasks-template.md — ✅ no changes required (constitution adds no principle-driven task types)
  - CLAUDE.md runtime guidance — ✅ updated (points to constitution + working flow)
Follow-up TODOs: none
-->

# BrAIniac Constitution

## Core Principles

### I. Engineering-Over-Utility (NON-NEGOTIABLE)

BrAIniac MUST serve as an engineering environment for agent construction, not as a low-code utility for one-off automation.

- Every feature MUST support at least one stage of the agent SDLC: design (canvas and node catalog), isolated execution (pipeline executor with runtime budgets), validation (preflight), or quantitative evaluation (evaluation service).
- Utility-only capabilities — features that automate a task without exposing architecture or enabling validation — are out of scope.
- Features MUST make the agent's architecture, state, and decisions observable to the user.

Rationale: the thesis identifies the lack of engineering observability and reproducible evaluation as the defining gap that BrAIniac must close. Utility-oriented features compete for scope without advancing that mission.

### II. Bounded Directed Graph

The pipeline graph MAY contain cycles. BrAIniac does not restrict to DAGs.

- Every cycle MUST be gated by a loop-policy with `maxIterations ≥ 1`.
- Pipeline execution MUST respect a global execution budget `B = (K_max, T_max, Cost_max, Tokens_max)` expressed on the pipeline and enforced by the runtime.
- Structural rules (connectedness, single final node, interface compatibility `Out_i ~ In_j`) MUST be enforced at preflight, not only at runtime.

Rationale: LLM agents require iterations (tool-call loops, retries, refinements). A DAG model is too restrictive; the bounded directed graph model with enforced loop-policy and execution budget matches runtime reality while keeping termination provable. Existing position is fixed in `docs/sdd/02-graph-constitution.md` and `docs/math_formulation_draft.md`.

### III. Two-Level Consistency

The pipeline (Node/Edge) layer and the internal runtime of composite nodes (e.g., `AgentCall`) are two distinct levels.

- Internal tool calls, retries, and sub-planning inside a node MUST NOT create external edges on the pipeline graph.
- Advertising tools to an agent MUST go through the canonical edge `ToolNode → AgentCall`; input-based mechanisms such as `tool_ref`/`tool_refs` are forbidden.
- Runtime telemetry of internal steps (tool-call traces, attempts, provider calls) MUST be captured inside the node's output envelope, not modelled as external structure.

Rationale: mixing levels produces topological explosion, unreadable canvases, and broken ownership of configuration. The separation is already normative in `docs/sdd/01-domain-glossary.md` and MUST persist across new features.

### IV. Specification-Driven Development (NON-NEGOTIABLE)

Every non-trivial feature MUST progress through the SpecKit flow: `constitution → specify → plan → tasks → implement`.

- Code MUST NOT be merged without a corresponding spec and plan under `specs/NNN-feature-name/`.
- When a feature touches `docs/math_*_draft.md` (formal postановка) or `docs/sdd/` (SDD), updates to those artefacts MUST be part of the same feature scope, not a follow-up.
- Every PR MUST include a Constitution Check statement (PASS or justified deviation).
- Deviations from the flow MUST be recorded in the plan's Complexity Tracking table with rationale.

Rationale: the project already treats `docs/sdd/` and `docs/math_*.md` as sources of truth ahead of code. SpecKit formalises that practice into a repeatable workflow and prevents drift between documentation and implementation.

### V. Automated Quantitative Evaluation

Agent quality MUST be determined by the formula `S = Σ w_j · S_j` as defined in `docs/math_evaluation_draft.md`.

- Every metric `f_j` MUST be normalised to `[0, 1]` with the "higher is better" convention. Mixing conventions is forbidden.
- Weights MUST satisfy `Σ w_j = 1` and be non-negative.
- Operational thresholds `T_max`, `C_max`, `R_fail_max` MUST act as hard gates independent of `S`: violating any single gate overrides the `S`-based verdict.
- Safety metrics (`toxicity`, `bias`, `pii_leak`) MUST act as a safety floor: violating a safety minimum forces the verdict into the "rework" band regardless of `S`.
- Judge-based metrics MAY use LLM-as-a-Judge. The judge model MUST be injectable and MUST be distinct from the models used inside the evaluated pipeline.
- Verdict interpretation: `S < 0.6` rework, `0.6 ≤ S ≤ 0.8` acceptable with improvements, `S > 0.8` pass.

Rationale: the thesis' central contribution is replacing human-in-the-loop evaluation with a formalised quantitative method. The formula, the operational gates, and the safety floor MUST be canonical across the system — any deviation by a feature fragments this contribution.

## Technology & Architecture Constraints

- **Backend**: TypeScript on Node.js (ESM). Express for HTTP, Prisma for persistence, Jest for unit and integration tests. Alternative stacks require a constitutional amendment.
- **LLM provider**: OpenRouter via `backend/src/services/core/openrouter/openrouter.adapter.ts`. Direct vendor SDKs (OpenAI, Anthropic, Mistral, etc.) inside services are forbidden — all integrations route through this adapter.
- **Frontend**: React.
- **Service layering (MUST)**:
  - `backend/src/services/data/` — CRUD over Prisma models only; no cross-entity orchestration.
  - `backend/src/services/core/` — infrastructure (auth, ownership, JWT, graph validation, OpenRouter).
  - `backend/src/services/application/` — orchestration that composes data and core services; the evaluation service lives under `services/application/evaluation/`.
  - `backend/src/routes/resources/<resource>/` — HTTP routing, auth middleware, ownership enforcement.
- **Persistence for evaluation history (MVP)**: file snapshots under `backend/.artifacts/evaluations/`, following the pattern established by `pipeline.executor.snapshot-store.ts`. Migration to a Prisma model is a separate amendment.
- **Extensibility**: node types, tools, metrics, and scenario presets MUST be expressible as configuration artefacts (JSON or Prisma-backed `config_json`), not hardcoded enumerations.

## Development Workflow & Quality Gates

- **Feature lifecycle**:
  1. `/speckit.constitution` — amend when a principle changes.
  2. `/speckit.specify` — produce `specs/NNN-feature-name/spec.md`.
  3. `/speckit.plan` — produce `plan.md` with a passing Constitution Check.
  4. `/speckit.tasks` — produce `tasks.md`, grouped by user story.
  5. `/speckit.implement` — code against tasks, committing often.
- **Blocking quality gates**:
  - Graph mutations (create/update/delete node or edge) MUST pass preflight per `docs/sdd/05-preflight-contract.md` before persistence.
  - Backend commits touching TypeScript MUST compile under `npx tsc --noEmit` before merge.
  - Features that affect pipeline execution MUST run the corresponding `test:*:e2e` script and pass.
  - Features that introduce or change metric definitions MUST update `docs/math_metric_catalog_draft.md` in the same PR.
- **Review**: every PR description MUST carry a short "Constitution Check" statement confirming compliance or listing justified deviations (which also appear in `plan.md`'s Complexity Tracking table).
- **Branching**: feature branches follow `NNN-feature-name` (SpecKit convention), cut from the designated integration branch.

## Governance

- This constitution supersedes any individual SDD document, spec, or plan. When a lower-level artefact conflicts with a principle here, the principle wins until the constitution itself is amended.
- **Amendments** require a PR that updates `.specify/memory/constitution.md`, bumps the version, updates dependent templates, and includes a Sync Impact Report at the top of the file:
  - **MAJOR** bump for principle removal or backward-incompatible redefinition.
  - **MINOR** bump for a new principle or section, or materially expanded guidance.
  - **PATCH** bump for clarifications or wording fixes with no semantic change.
- **Runtime guidance**: `CLAUDE.md` at the repository root serves as the quick-reference entry point for any agent (human or AI) working in this codebase; it MUST point to this constitution and to current active specs under `specs/`.
- **Non-compliance**: a merged change later found to violate this constitution MUST be reverted or retroactively amended at the next regular review.

**Version**: 1.0.0 | **Ratified**: 2026-04-22 | **Last Amended**: 2026-04-22
