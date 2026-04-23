---
description: "Task list for feature 001-ai-judge: ИИ-Судья Оценки Агентного Графа"
---

# Tasks: ИИ-Судья Оценки Агентного Графа

**Feature**: `001-ai-judge`
**Input**: Design documents from [specs/001-ai-judge/](.)
**Prerequisites**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: включены как smoke-скрипты `.mjs` по паттерну существующих
`test:contracts:freeze`, `test:executor:http`, `test:executor:coordination`.
Это соответствует требованию конституции (процесс разработки, п. «Перед merge
в `main` MUST проходить минимальный набор»). Полноценные unit/contract-тесты
создаются по мере необходимости внутри соответствующих user-story фаз.

**Organization**: задачи сгруппированы по user story; каждая story
независимо проверяется через отдельный smoke-скрипт и собственный чекпоинт.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно запускать параллельно (разные файлы, нет зависимостей).
- **[Story]**: US1 / US2 / US3 — привязка к user story из spec.md.
- В описании — абсолютные пути (относительно корня репозитория).

## Path Conventions (из plan.md)

- Node backend: `backend/src/routes/resources/{judge,judge_assessment,gold_annotation}/…`,
  `backend/src/services/application/{judge,gold_annotation}/…`,
  `backend/src/services/core/{judge_provider,eval_worker}/…`,
  `backend/src/services/data/*.service.ts`.
- Миграции Prisma: `backend/prisma/migrations/2026xxxx_add_judge_models/`.
- Seed-скрипты: `backend/prisma/seeds/seed-judge-bootstrap.mjs`.
- Smoke-тесты: `backend/scripts/judge-*-test.mjs`.
- Python-сайдкар: `judge-eval-worker/` в корне репозитория.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Поднять скелет новых компонентов (Python-сайдкар, docker-compose
запись, env-шаблоны, новые Node-зависимости). Ничего не ломает существующий
runtime.

- [X] T001 [P] Create Python sidecar project skeleton at `judge-eval-worker/` with `pyproject.toml`, `Dockerfile`, `app/main.py` (FastAPI hello world `/health`), `app/api/__init__.py`, `app/metrics/__init__.py`, `app/contracts/__init__.py`, `tests/__init__.py`
- [X] T002 Add `judge-eval-worker` service to `docker-compose.yaml` under profile `app` with internal network `brainiac-network`, port `8001`, healthcheck on `GET /health`, depends_on backend healthcheck
- [X] T003 [P] Extend `/Users/cuperuser/kostyA/Coding/BrAIniac/.env.example` and `/Users/cuperuser/kostyA/Coding/BrAIniac/.env.docker` with `JUDGE_PROVIDER`, `JUDGE_MISTRAL_API_KEY`, `JUDGE_MISTRAL_MODEL`, `JUDGE_OPENROUTER_MODEL`, `JUDGE_EVAL_WORKER_URL`, `JUDGE_EVAL_WORKER_TIMEOUT_MS`, `JUDGE_MAX_ATTEMPTS_PER_ITEM`, `JUDGE_SOFT_RETRY_DELAY_MS`, `EVAL_INFLIGHT_STALE_MS`, `JUDGE_FAIL_RATE_MAX` (см. quickstart.md)
- [X] T004 [P] Add Node deps to `backend/package.json`: `@mistralai/mistralai`, `ajv`, tree-edit-distance lib (final choice confirmed in T046), run `npm --prefix backend install`
- [X] T005 [P] Add Python deps to `judge-eval-worker/pyproject.toml`: `fastapi`, `uvicorn[standard]`, `pydantic`, `ragas`, `deepeval`, `detoxify`, `sentence-transformers`, `transformers`, `torch` (CPU wheels); write `judge-eval-worker/Dockerfile` using `python:3.11-slim` and multi-stage with torch CPU index URL

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Всё, что требуется для любой из user stories — модели БД, базовые
сервисы, абстракции, CRUD для `GoldAnnotation`, клиент сайдкара, JudgeProvider.

**⚠️ CRITICAL**: Ни одна user-story фаза не начинается до завершения Phase 2.

### Prisma schema & migration

- [X] T006 Add all 13 new models to `backend/prisma/schema.prisma` per [data-model.md](data-model.md) §1–§11: `JudgeAssessment`, `JudgeAssessmentItem`, `JudgeAssessmentInflight`, `MetricDefinition`, `MetricScore`, `WeightProfile`, `NormalizationProfile`, `AxisCoverage`, `OperationalMetrics`, `Document`, `GoldAnnotation`, `JudgeAssessmentFrozenGold`, `JudgeConversation`, `JudgeMessage`
- [X] T007 Generate migration: `npm --prefix backend run prisma:migrate -- --name add_judge_models`; verify migration SQL at `backend/prisma/migrations/2026xxxx_add_judge_models/migration.sql` against [data-model.md §14](data-model.md)
- [X] T008 Run `npm --prefix backend run prisma:generate` to regenerate Prisma client with new types

### Seed data

- [X] T009 Create `backend/prisma/seeds/seed-judge-bootstrap.mjs`: seed 25 `MetricDefinition` rows per FR-031 (codes, axis, requires_reference, executor), 4 `WeightProfile` (`rag_default_v1`, `tool_use_default_v1`, `extractor_default_v1`, `judge_default_v1`) with canonical weights per [research.md §R8](research.md), 1 `NormalizationProfile` `mvp_default_v1`
- [X] T010 Add `seed:judge-bootstrap` script to `backend/package.json` invoking T009

### Data services (one Prisma surface per file)

- [X] T011 [P] Create `backend/src/services/data/judge_assessment.service.ts` with CRUD + `transitionStatus(id, from, to)` enforcing state machine from data-model §1
- [X] T012 [P] Create `backend/src/services/data/judge_assessment_item.service.ts` with `upsert(assessmentId, itemIndex, payload)`, `listNonTerminal(assessmentId)`, `markTerminal(id, status, failureClass?)`
- [X] T013 [P] Create `backend/src/services/data/judge_assessment_inflight.service.ts` with atomic `claim(pipelineId, datasetId, assessmentId)`, `release(inflightId)`, `reapStale(staleMs)` (R4 from research.md)
- [X] T014 [P] Create `backend/src/services/data/metric_definition.service.ts` with `findByCode`, `listByAxis`, `listAll`
- [X] T015 [P] Create `backend/src/services/data/metric_score.service.ts` with `upsert(assessmentId, metricId, nodeId, payload)`, `listByAssessment(assessmentId)`
- [X] T016 [P] Create `backend/src/services/data/weight_profile.service.ts` with `findByCode`, `listActive`
- [X] T017 [P] Create `backend/src/services/data/normalization_profile.service.ts` with `findByCode`, `listActive`
- [X] T018 [P] Create `backend/src/services/data/gold_annotation.service.ts` with `create(payload)`, `createBatch(payload[])`, `listByDataset(datasetId, filter)`, `revise(goldAnnotationId, payload)` (auto-increment version + toggle `current`), `softDelete(id)`, `listCurrentForDocument(documentId, type)`
- [X] T019 [P] Create `backend/src/services/data/document.service.ts` with `create`, `findByDatasetItemKey`, `listByDataset`
- [X] T020 [P] Create `backend/src/services/data/judge_assessment_frozen_gold.service.ts` with `freeze(assessmentId, annotations[])`, `listForAssessment(assessmentId)`
- [X] T021 [P] Create `backend/src/services/data/judge_conversation.service.ts` with `create`, `findById`, `listForUser(userId, projectId)`, `touch(conversationId)`
- [X] T022 [P] Create `backend/src/services/data/judge_message.service.ts` with `append(conversationId, role, content, toolMeta?)`, `listByConversation(conversationId, {limit, beforeId})`
- [X] T023 [P] Create `backend/src/services/data/axis_coverage.service.ts` with `upsert(assessmentId, axis, covered, mandatory, metricCount)`, `listByAssessment(assessmentId)`
- [X] T024 [P] Create `backend/src/services/data/operational_metrics.service.ts` with `upsert(assessmentId, payload)`, `get(assessmentId)`

### Core abstractions

- [X] T025 Create `backend/src/services/core/judge_provider/judge_provider.ts` defining interface `JudgeProvider` with `chat(messages, tools?)`, `modelId`, `family`, `supportsToolCalls` per [research.md §R3](research.md)
- [X] T026 [P] Create `backend/src/services/core/judge_provider/mistral.adapter.ts` implementing `JudgeProvider` via `@mistralai/mistralai` (default model `ministral-3b-2410`, tool-calls support)
- [X] T027 [P] Create `backend/src/services/core/judge_provider/openrouter.adapter.ts` implementing `JudgeProvider` by reusing existing `backend/src/services/core/openrouter/openrouter.adapter.ts`
- [X] T028 Create `backend/src/services/core/judge_provider/index.ts` factory `resolveJudgeProvider()` that reads `JUDGE_PROVIDER` env and returns the corresponding adapter
- [X] T029 Create `backend/src/services/core/eval_worker/eval_worker.client.ts` with typed `computeMetric(code, payload)` method: POST to `${JUDGE_EVAL_WORKER_URL}/metrics/:code`, validate response shape `{ value ∈ [0,1], details?, warnings? }`, timeout `JUDGE_EVAL_WORKER_TIMEOUT_MS`, retry 2 times on 5xx/network, map 4xx/422 to non-retryable (R2, R6); include `healthCheck()` hitting `GET /health`

### Metric base abstraction

- [X] T030 Create `backend/src/services/application/judge/metrics/metric.base.ts` with abstract class `MetricBase` (fields `code`, `axis`, `requiresReference`, `executor`, `compute(ctx): Promise<MetricResult>`) and types `MetricContext`, `MetricResult` per [research.md §R5](research.md)
- [X] T031 Create `backend/src/services/application/judge/metric_registry.ts` with `register(metric)`, `getByCode(code)`, `listRegistered()`; load all metrics at module init via static imports

### GoldAnnotation CRUD (required by US1 orchestration)

- [X] T032 Create `backend/src/services/application/gold_annotation/gold_annotation.application.service.ts` orchestrating ownership check (via `services/core/ownership.service.ts`) + `payload` schema validation per annotation_type + delegation to data service T018
- [X] T033 Create `backend/src/routes/resources/gold_annotation/gold_annotation.routes.ts` implementing routes per [contracts/gold-annotations.md](contracts/gold-annotations.md): `POST /datasets/:dataset_id/gold-annotations` (single/batch), `GET /datasets/:dataset_id/gold-annotations`, `PUT /gold-annotations/:gold_annotation_id`, `DELETE /gold-annotations/:gold_annotation_id` — all delegating to application service
- [X] T034 Mount `gold_annotation.routes` in `backend/src/index.ts` behind auth middleware

### Graph classification helper (used for M'_0 rule-based baseline)

- [X] T035 Create `backend/src/services/application/judge/architectural_class.service.ts` implementing rule from [research.md §R8](research.md): inspect pipeline nodes to classify as `rag` / `tool_use` / `extractor` / `judge` with priority `judge > tool_use > rag > extractor`
- [X] T036 Create `backend/src/services/application/judge/m_prime_builder.service.ts` that given pipeline produces `M'_0` via: node role table from [docs/sdd/12-evaluation-metrics-catalog.md](../../docs/sdd/12-evaluation-metrics-catalog.md) + deduplication + mandatory axis coverage check (FR-002, FR-003)

### Preflight integration helper

- [X] T037 Create `backend/src/services/application/judge/preflight_gate.service.ts` that calls existing `services/core/graph_validation.service.ts` with `preset = default` and returns `{ hardErrors[], warnings[] }`; used as gate in `POST /judge/assessments` (R9)

**Checkpoint**: Foundational layer готов, user stories могут начинаться.

---

## Phase 3: User Story 1 — Автоматическая Оценка Пайплайна (Priority: P1) 🎯 MVP

**Goal**: Студент запускает оценку существующего pipeline+dataset, получает
async `assessment_id`, опрашивает статус, при завершении получает отчёт
`{ S, verdict, axis_coverage, metric_scores[], operational }`.

**Independent Test**: `backend/scripts/judge-assessment-e2e-test.mjs` —
создаёт проект/pipeline/dataset, загружает `GoldAnnotation` через
`POST /datasets/:id/gold-annotations`, запускает `POST /judge/assessments`,
polling'ом через `GET /judge/assessments/:id` ждёт `status = succeeded`,
валидирует `summary.final_score ∈ [0,1]`, `summary.verdict ∈ {improvement,
satisfactory, pass}`, покрытие осей A/B/D/H, минимум 2 метрики на ось.

### Metric implementations — native (computed in Node)

- [X] T038 [P] [US1] Implement `f_EM` in `backend/src/services/application/judge/metrics/correctness/exact-match.metric.ts` (normalize + exact string match)
- [X] T039 [P] [US1] Implement `f_F1` in `backend/src/services/application/judge/metrics/correctness/token-f1.metric.ts` (tokenize, set intersection, harmonic mean)
- [X] T040 [P] [US1] Implement `f_recall_at_k` in `backend/src/services/application/judge/metrics/retrieval/recall-at-k.metric.ts` (reference `relevant_docs` ∩ top-k / |relevant|)
- [X] T041 [P] [US1] Implement `f_ndcg_at_k` in `backend/src/services/application/judge/metrics/retrieval/ndcg-at-k.metric.ts` (DCG@k / IDCG@k)
- [X] T042 [P] [US1] Implement `f_ctx_prec` in `backend/src/services/application/judge/metrics/retrieval/context-precision.metric.ts`
- [X] T043 [P] [US1] Implement `f_ctx_rec` in `backend/src/services/application/judge/metrics/retrieval/context-recall.metric.ts`
- [X] T044 [P] [US1] Implement `f_toolsel`, `f_argF1`, `f_tool_ok` in `backend/src/services/application/judge/metrics/tool_use/tool-selection.metric.ts`, `parameter-f1.metric.ts`, `tool-call-success.metric.ts` (source: `tool_call_trace` из freeze-контракта)
- [X] T045 [P] [US1] Implement `f_trajIoU`, `f_planEff`, `f_node_cov` in `backend/src/services/application/judge/metrics/tool_use/trajectory-iou.metric.ts`, `plan-efficiency.metric.ts`, `node-coverage.metric.ts` (cycle-collapsed trajectory per FR-009)
- [X] T046 [P] [US1] Implement `f_schema`, `f_field`, `f_TED` in `backend/src/services/application/judge/metrics/structure/schema-validity.metric.ts` (Ajv), `field-f1.metric.ts`, `tree-edit-distance.metric.ts` (finalize TED lib choice: evaluate `tree-edit-distance` vs `edit-distance-tree` by license + maintenance, pick one, document in file header)
- [X] T047 [P] [US1] Implement `f_loop_term`, `f_loop_budget`, `f_loop_conv`, `f_retry` in `backend/src/services/application/judge/metrics/control_flow/*.metric.ts` reading loop metadata from `RunTask.outputJson` / agent output (acyclic case → constants per FR-011)
- [X] T048 [P] [US1] Implement `f_consist` in `backend/src/services/application/judge/metrics/safety/self-consistency.metric.ts` (majority vote on ≥3 LLM-judge resamples)
- [X] T049 [P] [US1] Implement `f_check` in `backend/src/services/application/judge/metrics/llm_judge/checkeval.metric.ts` (LLM-judge evaluates checklist of boolean criteria → mean)

### Metric implementations — sidecar (delegate to judge-eval-worker)

- [X] T050 [P] [US1] Implement `f_sim` in `backend/src/services/application/judge/metrics/correctness/semantic-similarity.metric.ts` (`executor = 'sidecar'`, calls `eval_worker.client.computeMetric('f_sim', …)`)
- [X] T051 [P] [US1] Implement `f_corr` in `backend/src/services/application/judge/metrics/correctness/answer-correctness.metric.ts` (sidecar → Ragas Answer Correctness)
- [X] T052 [P] [US1] Implement `f_faith` in `backend/src/services/application/judge/metrics/grounding/faithfulness.metric.ts` (sidecar → Ragas Faithfulness)
- [X] T053 [P] [US1] Implement `f_fact` in `backend/src/services/application/judge/metrics/grounding/fact-score.metric.ts` (sidecar → FActScore)
- [X] T054 [P] [US1] Implement `f_cite` in `backend/src/services/application/judge/metrics/grounding/citation-f1.metric.ts` (sidecar → ALCE Citation F1)
- [X] T055 [P] [US1] Implement `f_contra` in `backend/src/services/application/judge/metrics/grounding/contradiction-rate.metric.ts` (sidecar → NLI contradiction rate)
- [X] T056 [P] [US1] Implement `f_judge_ref` in `backend/src/services/application/judge/metrics/llm_judge/rubric-judge.metric.ts` (sidecar → G-Eval/Prometheus rubric)
- [X] T057 [P] [US1] Implement `f_safe` in `backend/src/services/application/judge/metrics/safety/safety-score.metric.ts` (sidecar → `1 − max(Detoxify, LlamaGuard)`)

### Metric registration

- [X] T058 [US1] Register all metrics from T038..T057 in `backend/src/services/application/judge/metric_registry.ts` with static imports; enforce that `MetricRegistry.listRegistered()` returns every metric code enumerated in FR-031 (29 кодов, не менее 2 на обязательную ось)

### Python sidecar metric handlers

- [X] T059 [US1] Implement `judge-eval-worker/app/api/metrics.py` with FastAPI route `POST /metrics/{metric_code}` dispatching by code to adapter modules, validating request via pydantic schemas from `judge-eval-worker/app/contracts/schemas.py`
- [X] T060 [P] [US1] Implement `judge-eval-worker/app/metrics/ragas_adapter.py` covering `f_faith`, `f_fact`, `f_cite`, `f_corr` via Ragas; normalize all outputs to `[0,1]`
- [X] T061 [P] [US1] Implement `judge-eval-worker/app/metrics/nli_adapter.py` covering `f_contra` via sentence-transformers NLI + `f_sim` via embedding cosine
- [X] T062 [P] [US1] Implement `judge-eval-worker/app/metrics/detoxify_adapter.py` covering `f_safe` via Detoxify (+ optional LlamaGuard hosted if configured)
- [X] T063 [P] [US1] Implement `judge-eval-worker/app/metrics/rubric_adapter.py` covering `f_judge_ref` via Prometheus/G-Eval rubric prompt (if using local HF model, load in `GET /health` warmup)
- [X] T064 [US1] Implement `judge-eval-worker/app/contracts/schemas.py` with pydantic models per metric per [contracts/eval-worker.md § Schemas per metric](contracts/eval-worker.md)
- [X] T065 [US1] Implement `judge-eval-worker/app/main.py` wiring FastAPI app, mounting `/health` (returns `status: ok` only after all adapters `ready()`), mounting `/metrics/*` from T059

### Weight profile & normalization application

- [X] T066 [US1] Create `backend/src/services/application/judge/weight_profile.service.ts` — given `M'` + architectural class, resolves `WeightProfile`, filters `weights_json` to keys present in `M'`, renormalizes so that `Σ w_j = 1.0 ± 0.001`
- [X] T067 [US1] Create `backend/src/services/application/judge/axis_coverage.service.ts` — given `M'` + list of `MetricDefinition` from registry, computes mandatory axis set based on pipeline composition (FR-003), evaluates coverage, persists via data-service T023
- [X] T068 [US1] Create `backend/src/services/application/judge/score_aggregator.service.ts` — given per-metric `S_j` and weights, returns `{ final_score, verdict, hard_gate_status }` with thresholds from request or defaults (FR-015, FR-017)

### Per-item execution runner

- [X] T069 [US1] Create `backend/src/services/application/judge/assessment_runner.service.ts` encapsulating per-item execution loop: for each `Document` in dataset, (1) pick non-terminal `JudgeAssessmentItem`, (2) run agent via existing `POST /pipelines/:id/execute` path (or direct executor call) to produce `agent_output + tool_call_trace`, (3) load required `GoldAnnotation` versions and freeze them via T020, (4) compute each metric in `M'` via registry, (5) persist `MetricScore` per (metric, node), (6) update item status, (7) honor `JUDGE_MAX_ATTEMPTS_PER_ITEM` + backoff (R6) and taxonomy mapping
- [X] T070 [US1] Extend T069 to support checkpoint resume (FR-EXEC-008): skip items already in terminal status; on process restart, picking up where last item ended

### Application service + orchestration

- [X] T071 [US1] Create `backend/src/services/application/judge/judge_assessment.application.service.ts` with methods: `startAssessment(request, userId, idempotencyKey?)` — preflight (T037), idempotency lookup, inflight claim (T013), create `JudgeAssessment` in `queued`, enqueue runner (T069); `getAssessment(id, userId)` returns full state + summary; `finalizeAssessment(id)` — compute aggregates (T066, T067, T068), write `OperationalMetrics` (T024), transition to `succeeded` or `failed`, release inflight
- [X] T072 [US1] Integrate `assessment_runner` with a light async job scheduler (reuse existing executor coordination pattern or simple `setImmediate`+promise chain bounded by node process; document choice in file header)

### Routes

- [X] T073 [US1] Create `backend/src/routes/resources/judge_assessment/judge_assessment.routes.ts` implementing `POST /judge/assessments`, `GET /judge/assessments/:id`, `GET /judge/assessments/:id/comparison` per [contracts/judge-assessments.md](contracts/judge-assessments.md) — only delegating to application service; no direct Prisma calls (FR-ARCH-001)
- [X] T074 [US1] Mount `judge_assessment.routes` in `backend/src/index.ts` behind auth middleware

### End-to-end smoke test

- [X] T075 [US1] Create `backend/scripts/judge-assessment-e2e-test.mjs` per [quickstart.md § Smoke-сценарий: первая оценка](quickstart.md): create project+pipeline+dataset+gold, POST /judge/assessments, poll GET /judge/assessments/:id until terminal, assert shape; run with `docker compose --profile app up -d` precondition
- [X] T076 [US1] Add `test:judge:e2e` script to `backend/package.json` and ensure `npm --prefix backend test:judge:e2e` passes against local docker-compose stack

### Contract validation

- [X] T077 [US1] Create `backend/scripts/judge-eval-worker-contract-test.mjs` verifying sidecar responses match [contracts/eval-worker.md](contracts/eval-worker.md) for each sidecar metric: shape `{ value ∈ [0,1], details?, warnings? }`, golden inputs; add `test:judge:worker` entry to `backend/package.json → scripts` pointing to this file

**Checkpoint**: US1 fully functional. `S`, verdict, axis coverage, per-node metric scores available; in-flight lock, idempotent replay, per-item checkpoint tested.

---

## Phase 4: User Story 2 — Интерактивный Разбор Оценки Через Чат С Судьёй (Priority: P2)

**Goal**: Пользователь ведёт диалог с судьёй, судья использует tool-calls
`getNode`/`getMetrics`/`getLogs` для подтянутой аргументации; история
диалога персистентна, привязана к `User`+`Project`.

**Independent Test**: `backend/scripts/judge-chat-smoke-test.mjs` — создаёт
`JudgeAssessment` через US1, открывает чат, задаёт «какой узел тянет `S`
вниз?», валидирует, что судья выполнил tool-call `getMetrics`, ответил
осмысленно, история читается через `GET /judge/history`; перезапуск
процесса не теряет историю.

### Tool-call handlers

- [X] T078 [P] [US2] Implement `backend/src/services/application/judge/tool_handlers/get_node.handler.ts` resolving `node_id` via `services/data/node.service` with ownership check, returning `{ node_id, label, category, type, status, config }` per [contracts/judge-chat.md § Tool-calls](contracts/judge-chat.md)
- [X] T079 [P] [US2] Implement `backend/src/services/application/judge/tool_handlers/get_metrics.handler.ts` accepting `{ assessment_id }` or `{ run_task_id }`, returning `{ metric_code: value }` via `metric_score.service` (T015)
- [X] T080 [P] [US2] Implement `backend/src/services/application/judge/tool_handlers/get_logs.handler.ts` accepting `{ run_task_id }` or `{ assessment_item_id }`, returning `{ log_lines, tool_call_trace }`
- [X] T081 [US2] Create `backend/src/services/application/judge/tool_handlers/index.ts` exporting registry `{ getNode, getMetrics, getLogs }` and tool-schema array consumable by `JudgeProvider` adapters (decoupled from specific SDK per FR-ARCH-003)

### Chat application service

- [X] T082 [US2] Create `backend/src/services/application/judge/judge_chat.application.service.ts` with `sendMessage(userId, projectId, conversationId?, assessmentId?, message)`: ownership check, rehydrate history from BD (T022), call `JudgeProvider.chat(history + message, tools)`, execute tool-calls via handler registry (T081), persist all new messages via T022, touch conversation (T021); MUST NOT use process-local state (FR-ARCH-002)
- [X] T083 [US2] Create `backend/src/services/application/judge/judge_history.application.service.ts` with `getHistory(userId, conversationId, {limit, beforeId})` delegating to data-services with ownership

### Routes

- [X] T084 [US2] Create `backend/src/routes/resources/judge/judge.chat.routes.ts` implementing `POST /judge/chat` and `GET /judge/history` per [contracts/judge-chat.md](contracts/judge-chat.md); only delegating to application services
- [X] T085 [US2] Mount `judge.chat.routes` in `backend/src/index.ts` behind auth middleware

### Smoke test

- [X] T086 [US2] Create `backend/scripts/judge-chat-smoke-test.mjs` per [quickstart.md § Smoke-сценарий: чат судьи](quickstart.md): open chat, send two messages, verify tool_calls_executed non-empty at least once, GET history contains user+assistant+tool entries in order. Также включить негативный кейс для FR-023: запросить данные по несуществующему `assessment_id`, assert — ответ судьи не содержит вымышленных числовых значений метрик (assistant_message.content не содержит числовых литералов, помеченных как «S_j = …» для несуществующего ресурса)
- [X] T087 [US2] Add `test:judge:chat` script to `backend/package.json`

**Checkpoint**: US1 + US2 работают независимо; чат может объяснить оценку, опираясь на сохранённые `MetricScore` и `tool_call_trace`.

---

## Phase 5: User Story 3 — История Оценок И Сравнение Версий Пайплайна (Priority: P3)

**Goal**: Две оценки того же пайплайна (разные `PipelineVersion` или разные
запуски) сопоставляются через один API-вызов с дельтами `S` и `ΔS_j`.

**Independent Test**: `backend/scripts/judge-assessment-comparison-test.mjs`
— создаёт два `JudgeAssessment` одного пайплайна, ждёт terminal, вызывает
`GET /judge/assessments/:id/comparison?against=:other_id`, валидирует
`delta_score`, `delta_per_metric[]`, `axis_coverage_diff[]`.

### Comparison service

- [X] T088 [US3] Create `backend/src/services/application/judge/judge_comparison.application.service.ts` with `compare(baseId, againstId, userId)`: ownership check on both, reject with `422` if either not `succeeded`, diff per-metric `S_j`, axis coverage, return payload per [contracts/judge-assessments.md § comparison](contracts/judge-assessments.md)

### Route wiring (handler already created in T073)

- [X] T089 [US3] Extend `backend/src/routes/resources/judge_assessment/judge_assessment.routes.ts` `/judge/assessments/:id/comparison` handler to delegate to T088; return `200 OK` or `422 JUDGE_ASSESSMENT_COMPARISON_NOT_READY`

### Smoke test

- [X] T090 [US3] Create `backend/scripts/judge-assessment-comparison-test.mjs` — runs two full assessments (reusing infra from T075), asserts comparison shape
- [X] T091 [US3] Add `test:judge:compare` script to `backend/package.json`

**Checkpoint**: все три user stories работают независимо; MVP готов к демонстрации.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Закрыть deferred-пункты, добавить наблюдаемость, обновить
документацию, обеспечить прохождение всех pre-merge проверок конституции.

- [X] T092 [P] Add structured logging in all new application services (JSON logs with `assessment_id`, `item_index`, `metric_code`, latency, cost) per конституция принцип VII (Observability)
- [X] T093 [P] Emit per-assessment timing metrics (start/end, per-metric latency, sidecar call latency) to stdout in a greppable format for offline analysis (SC-004 валидация `τ ≥ 0.4`)
- [X] T094 Tighten `onDelete` policies on FKs in `backend/prisma/schema.prisma` per deferred §12 data-model: decide between `Cascade` vs `Restrict` for each relation; create follow-up migration
- [X] T095 [P] Add seed coverage for 8 dataset items covering RAG scenario used by E2E tests (`backend/prisma/seeds/seed-judge-bootstrap.mjs` extension) so T075 can run without manual setup
- [X] T096 Verify all pre-merge constitution gates pass: `npm --prefix backend run test:contracts:freeze`, `test:executor:http`, `test:executor:coordination`, plus new `test:judge:e2e`, `test:judge:chat`, `test:judge:compare`, `test:judge:worker`, `test:judge:repro` (T101), `test:judge:route-audit` (T102), `test:judge:cyclic` (T103); fix any regressions
- [X] T097 [P] Run [quickstart.md](quickstart.md) end-to-end manually (all three user stories sequentially), fill out quickstart follow-up section if any steps need clarification
- [X] T098 [P] Update [README.md](../../README.md) with a short section referencing the judge feature and `docker compose --profile app up` requirement
- [X] T099 Review `MetricScore.details_json` schema for privacy (no reference answers leaking to frontend beyond owner scope) per R13 deferred; document any required redaction
- [X] T100 [P] Add `backend/scripts/judge-anti-bias-smoke-test.mjs` asserting that if `JUDGE_PROVIDER` matches `OPENROUTER_LLM_MODEL` family, the judge warns per FR-028
- [X] T101 [P] Add `backend/scripts/judge-reproducibility-smoke-test.mjs` enforcing SC-002: выполнить оценку одного и того же `(pipeline_id, dataset_id)` дважды с разными `x-idempotency-key`, дождаться `succeeded`, assert `M'_0` идентичен по составу метрик и `|ΔS| ≤ 0.02`; добавить `test:judge:repro` в `backend/package.json → scripts`
- [X] T102 Add `backend/scripts/judge-route-audit.mjs` enforcing SC-008: рекурсивный grep `from '@prisma` и `prisma\\.` внутри `backend/src/routes/**/*.ts`; скрипт падает при любом попадании; добавить `test:judge:route-audit` в `backend/package.json → scripts` и включить в pre-merge gates из T096
- [X] T103 [P] Extend seed fixture (T095) a cyclic RAG pipeline with `LoopGate -> AgentCall -> LoopGate`, `maxIterations = 3`; extend `judge-assessment-e2e-test.mjs` (T075) or add `backend/scripts/judge-cyclic-graph-smoke-test.mjs` enforcing SC-006: assessment завершается `succeeded`, метрики `f_loop_term`, `f_loop_budget`, `f_loop_conv` присутствуют в `summary.metric_scores[]` и имеют `aggregation_method` в {`mean_over_iterations`, `last_iteration`} согласно FR-010; на аналогичном ациклическом пайплайне assert циклические метрики редуцируются к константам (FR-011); добавить `test:judge:cyclic` в `backend/package.json → scripts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: нет зависимостей, можно стартовать сразу.
- **Phase 2 Foundational**: блокирует все user-story фазы.
- **Phase 3 US1 (P1 — MVP)**: блокируется Phase 2.
- **Phase 4 US2 (P2)**: блокируется Phase 2; может идти параллельно с US1, если `metric_score.service` (T015) и `judge_conversation/judge_message.service` (T021–T022) готовы, и существует хоть один `JudgeAssessment` для smoke-теста.
- **Phase 5 US3 (P3)**: блокируется Phase 2; фактически требует готового US1 для содержательного smoke, но поверх Foundational начинается самостоятельно.
- **Phase 6 Polish**: после завершения трёх user stories.

### User Story Dependencies

- **US1**: depends on Phase 2 (T006..T037 + T029, T031).
- **US2**: depends on Phase 2 (T021, T022, T025..T028, T031). Для content-full smoke (T086) ссылается на завершённый US1 assessment.
- **US3**: depends on Phase 2 + минимум T071 (для состояния `succeeded`). Для smoke (T090) нужны два завершённых US1 прогона.

### Внутри User Story 1

- T038..T057 (все метрики) параллелизуемы между собой, т.к. каждая в отдельном файле.
- T058 (регистрация) зависит от T038..T057.
- T066..T068 зависят от T014..T017 и T031.
- T069..T070 зависят от T011..T024, T030..T037, T066..T068, а также от T058.
- T071..T072 зависят от T069..T070.
- T073 (routes) зависит от T071.
- T074 — после T073.
- T075 (e2e) — после T032..T034 (GoldAnnotation CRUD) и T074.
- T059..T065 (sidecar) могут идти параллельно с T038..T049 (Node-метрики), но T050..T057 (Node-обёртки sidecar-метрик) требуют рабочего сайдкара (хотя бы health-check), иначе проваливаются при интеграционном прогоне.

### Внутри User Story 2

- T078..T080 параллелизуемы.
- T081 зависит от T078..T080.
- T082 зависит от T021, T022, T025..T028, T031, T081.
- T083 зависит от T022.
- T084 — после T082, T083.
- T086 — после T074 (нужен assessment для getMetrics) и T085.

### Внутри User Story 3

- T088 зависит от T011 (assessment service) и T015 (metric scores), T023 (axis coverage).
- T089 — после T073 и T088.
- T090 — после T074 и T089; требует работающий US1 для создания двух завершённых оценок.

### Parallel Opportunities

- Все `[P]` в Phase 2 (data services T011..T024, T026..T027) запускаются параллельно в пределах Phase 2.
- В Phase 3: все 25 метрик (T038..T057) параллельны; sidecar-адаптеры T060..T063 параллельны друг другу.
- В Phase 4: T078..T080 параллельны.
- Polish-задачи `[P]` в Phase 6 независимы.

---

## Parallel Example: Phase 2 data services

```bash
# Все data services можно распределить между исполнителями:
Task: "Create judge_assessment.service.ts"          # T011
Task: "Create judge_assessment_item.service.ts"     # T012
Task: "Create judge_assessment_inflight.service.ts" # T013
Task: "Create metric_definition.service.ts"         # T014
Task: "Create metric_score.service.ts"              # T015
Task: "Create weight_profile.service.ts"            # T016
Task: "Create normalization_profile.service.ts"     # T017
Task: "Create gold_annotation.service.ts"           # T018
Task: "Create document.service.ts"                  # T019
Task: "Create judge_assessment_frozen_gold.service.ts"  # T020
Task: "Create judge_conversation.service.ts"        # T021
Task: "Create judge_message.service.ts"             # T022
Task: "Create axis_coverage.service.ts"             # T023
Task: "Create operational_metrics.service.ts"       # T024
```

## Parallel Example: Phase 3 metric implementations

```bash
# 25 метрик пишутся параллельно, каждая в своём файле:
Task: "Implement f_EM in metrics/correctness/exact-match.metric.ts"    # T038
Task: "Implement f_F1 in metrics/correctness/token-f1.metric.ts"       # T039
# …и так до T057; T058 (регистрация) только после завершения всех.
```

---

## Implementation Strategy

### MVP First (Setup → Foundational → US1)

1. Phase 1: Setup (T001..T005) — подготовить скелет сайдкара, docker-compose,
   env, Node-deps.
2. Phase 2: Foundational (T006..T037) — миграция, seed, data-сервисы, ядра.
3. Phase 3: US1 (T038..T077) — метрики (native + sidecar), orchestration,
   routes, smoke-тест.
4. **STOP & VALIDATE**: запустить `docker compose --profile app up --build` +
   `npm --prefix backend run test:judge:e2e`. Готов MVP.

### Incremental Delivery

1. Setup + Foundational → Foundation ready.
2. US1 → MVP demo (`POST /judge/assessments` работает, отчёт с `S`).
3. US2 → educational loop closed (чат объясняет оценку).
4. US3 → итеративное сравнение версий.
5. Polish → pre-merge готовность (все gating-тесты зелёные).

### Parallel Team Strategy

- Разработчик A: T006..T010 (миграция, seed), затем T011..T024 параллельно
  (data-сервисы по одному).
- Разработчик B: T025..T031 (core абстракции + metric base + registry).
- Разработчик C: T032..T037 (GoldAnnotation CRUD + preflight gate + class
  helpers).
- После Foundational: A ведёт sidecar (T059..T065), B — native-метрики
  (T038..T049), C — orchestration/runner (T069..T076).
- US2 и US3 можно поднимать после T074.

---

## Notes

- Все `[P]` — разные файлы, без взаимных dependency.
- Все новые маршруты MUST использовать существующий `auth.middleware.ts` и
  `ownership.service.ts` (FR-ARCH-001, R13).
- `router ↔ application-service ↔ data-service` — строго через границы
  слоёв; маршруты и application-сервисы MUST NOT импортировать Prisma
  напрямую (FR-ARCH-001, контрольный сценарий в SC-008).
- Инстансы `JudgeAgent`/`JudgeChatService` MUST быть stateless относительно
  истории диалога; история читается из БД на каждый запрос (FR-ARCH-002).
- Коммит после каждой завершённой задачи или логической группы (например,
  все metric-файлы для одной оси) — упрощает review и возможный rollback.
- При внесении новой метрики после MVP — один файл в соответствующей
  тематической папке + одна строка регистрации в `metric_registry.ts`
  (SC-005).
