<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- Template principle 1 -> I. Product Truth Comes From SDD And Code
- Template principle 2 -> II. Fixed Technology Stack
- Template principle 3 -> III. Clear, Adaptive UX
- Template principle 4 -> IV. Simple, Understandable Code
- Template principle 5 -> V. Tests Prove Working Behavior
Added sections:
- Product And Runtime Constraints
- Development Workflow And Quality Gates
Removed sections:
- Template placeholder sections
Templates requiring updates:
- updated .specify/templates/plan-template.md
- updated .specify/templates/spec-template.md
- updated .specify/templates/tasks-template.md
- N/A .specify/templates/commands/*.md (directory absent)
Follow-up TODOs:
- Fix mojibake/encoding in .specify/extensions/git/scripts/powershell/initialize-repo.ps1 output line.
-->
# BrAIniac Constitution

## Core Principles

### I. Product Truth Comes From SDD And Code
Every feature MUST be aligned with the current SDD files under `docs/sdd/` and
the actual implementation in `backend/` and `frontend/`. When SDD and code
disagree, the implementation plan MUST explicitly name the conflict and choose
one source of truth before coding starts. Runtime contracts that are already
frozen in SDD, especially graph validation, RAG execution, dataset upload,
tool contracts, and frontend/backend execution APIs, MUST NOT be changed
implicitly.

Rationale: BrAIniac already has a lightweight SDD system. Spec Kit must extend
that discipline instead of creating a second, conflicting planning layer.

### II. Fixed Technology Stack
New application code MUST stay within the existing TypeScript web stack unless
a plan documents a specific approved exception. Backend work uses Node.js,
Express, Prisma, PostgreSQL, and the current script-based test approach in
`backend/package.json`. Frontend work uses React, TypeScript, ReactFlow,
Tailwind CSS, Radix where already present, and the existing Create React App
tooling. Docker Compose remains the shared local integration environment.

New frameworks, runtimes, databases, UI kits, state managers, queues, or
service boundaries MUST NOT be introduced only for convenience. Any dependency
addition MUST include the concrete problem it solves, why existing project
tools are insufficient, and what tests prove the integration.

Rationale: A stable stack keeps student-facing development understandable and
prevents the project from drifting into unnecessary infrastructure work.

### III. Clear, Adaptive UX
User-facing changes MUST make the graph/RAG workflow understandable without
hidden behavior. The UI MUST expose important state, validation problems,
provider/tool diagnostics, dataset selection, execution status, and final
results in the relevant workflow surface. Frontend behavior MUST remain usable
on common desktop and mobile widths, with no overlapping controls, clipped
labels, or inaccessible primary actions.

UX copy and controls MUST reflect actual backend capability. Nodes or actions
without confirmed runtime support MUST be hidden, clearly disabled, or
implemented with tests before being presented as available.

Rationale: BrAIniac is an educational tool. Users must be able to understand
what the system is doing and why a graph succeeds, warns, or fails.

### IV. Simple, Understandable Code
Implementation MUST prefer small, direct modules that match existing project
patterns. Shared abstractions are allowed only when they remove real
duplication or make a contract easier to test. Code MUST avoid speculative
framework layers, generic engines, broad rewrites, and compatibility branches
that are not required by the current SDD or feature spec.

Complexity that crosses module boundaries, changes frozen contracts, adds a
new dependency, or introduces hidden runtime behavior MUST be documented in
the implementation plan's Complexity Tracking table with a simpler alternative
and the reason it was rejected.

Rationale: The codebase should stay readable for contributors and students.
Simplicity is a product requirement, not just a style preference.

### V. Tests Prove Working Behavior
Every feature or bug fix MUST include tests appropriate to its risk and user
surface. Backend changes MUST use the existing scripts where possible:
integration, auth, ownership, database invariant, RAG smoke/e2e, executor,
and contract-freeze tests. Frontend changes MUST include component, user-flow,
or build-level verification when behavior or layout changes. Contract changes
MUST include contract tests before implementation.

Plans and task lists MUST state which test types are required and why. If a
test cannot be automated in the current stack, the plan MUST document the
manual verification steps, the gap, and the follow-up needed to automate it.

Rationale: The project contains graph execution, auth, persistence, RAG, and
provider failure paths. Passing code is not enough unless the relevant behavior
is exercised.

## Product And Runtime Constraints

- The canonical graph model MUST preserve the SDD rules: graph validation runs
  on mutations and preflight, cross-pipeline edges are forbidden, duplicate
  `(from,to)` edges are forbidden, and cycles require an explicit loop policy.
- `AgentCall` tool access MUST be represented through explicit
  `ToolNode -> AgentCall` capability edges. Hidden tool injection and legacy
  `tool_ref`/`tool_refs` paths MUST NOT be reintroduced.
- Dataset upload is a user-visible workflow, not a hidden graph side effect.
  RAG preparation MUST happen through explicit graph/tool behavior or through
  clearly exposed product controls.
- Frontend node catalogs MUST show only runtime-backed nodes for the current
  product scope, or visibly mark unsupported work as unavailable.
- Provider failures, empty agent output, validation warnings, and execution
  diagnostics MUST be surfaced as diagnostic states rather than being treated
  as successful user answers.
- Public backend contracts used by the frontend MUST remain covered by
  contract-freeze or equivalent tests when changed.

## Development Workflow And Quality Gates

- Before planning, read the current feature spec, relevant `docs/sdd/` files,
  `backend/package.json`, `frontend/package.json`, and any affected code paths.
- Each implementation plan MUST fill the Constitution Check with concrete
  answers for SDD alignment, stack fit, UX/adaptivity, simplicity, and tests.
- Each feature spec MUST include independently testable user scenarios,
  measurable success criteria, important edge cases, and explicit assumptions.
- Each task list MUST include test tasks for every story or change surface
  unless the plan documents why automation is not currently possible.
- Before completion, run the smallest reliable test set that proves the change.
  For cross-cutting backend changes, run relevant `npm run test:*` scripts.
  For frontend changes, run at least build or targeted UI tests.
- Documentation updates MUST accompany changes to SDD contracts, API shape,
  node behavior, diagnostics, or user-facing workflow.

## Governance

This constitution supersedes conflicting local habits and generic Spec Kit
defaults for this repository. SDD files remain the detailed product/runtime
contract layer; this constitution defines the higher-level engineering rules
that all specs, plans, tasks, and code reviews must enforce.

Amendments require:

1. A documented reason for the change and the affected principles or sections.
2. Review of impacted SDD files, templates, and runtime guidance.
3. A semantic version update:
   - MAJOR for incompatible governance or principle changes.
   - MINOR for new principles, sections, or materially expanded requirements.
   - PATCH for wording, clarification, and non-semantic fixes.
4. A Sync Impact Report at the top of this file.

Compliance is checked during plan creation, task generation, implementation,
and review. A feature with unresolved constitution violations MUST NOT proceed
to implementation unless the violation is explicitly tracked with a simpler
alternative and an approved reason.

**Version**: 1.0.0 | **Ratified**: 2026-04-29 | **Last Amended**: 2026-04-29
