# BrAIniac Runtime Guidance

Entry point for humans and AI agents working in this repository.

## Source of truth hierarchy

1. `.specify/memory/constitution.md` — project principles (non-negotiable unless amended via `/speckit.constitution`).
2. `specs/NNN-feature-name/spec.md` and `plan.md` — feature-level contracts.
3. `docs/sdd/` — architectural SDD (graph constitution, node catalog, preflight contract, runtime snapshot).
4. `docs/math_*_draft.md` — formal postановка задач построения и оценки, каталог метрик.

When any of (1)–(4) conflict, (1) wins until the constitution is amended.

## Working flow

Every non-trivial change goes through SpecKit. From a clean working tree:

1. `/speckit.constitution` — amend only if a principle changes.
2. `/speckit.specify` — creates feature branch `NNN-feature-name` and `specs/NNN-feature-name/spec.md`.
3. `/speckit.plan` — produces `plan.md` including a Constitution Check.
4. `/speckit.tasks` — produces `tasks.md`, grouped by user story.
5. `/speckit.implement` — code against tasks, committing often.

## Key repository paths

- `backend/src/services/core/` — infrastructure (auth, ownership, openrouter, graph validation, JWT).
- `backend/src/services/data/` — CRUD over Prisma models.
- `backend/src/services/application/` — orchestration; evaluation lives under `services/application/evaluation/`.
- `backend/src/routes/resources/<resource>/` — HTTP with auth and ownership.
- `backend/.artifacts/` — file-based snapshots (execution, and evaluation history in MVP).
- `docs/sdd/` — SDD documents (01 glossary → 10 real-rag plan).
- `docs/math_formulation_draft.md` — построение агента.
- `docs/math_evaluation_draft.md` — оценка агента по ВКР.
- `docs/math_metric_catalog_draft.md` — M, M' rules, weight presets, thresholds.

## Conventions

- TypeScript ESM: imports carry `.js` extension even for `.ts` source.
- Pipeline graphs are **bounded directed graphs**, not DAGs — cycles MUST have `loop.maxIterations`.
- Metrics follow "higher is better" on `[0, 1]`; weights sum to 1.
- Operational gates (`T_max`, `C_max`, `R_fail_max`) are hard and independent of `S`.
- All LLM calls go through `services/core/openrouter/openrouter.adapter.ts`; no direct vendor SDKs.
- Every PR description MUST include a Constitution Check statement.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
