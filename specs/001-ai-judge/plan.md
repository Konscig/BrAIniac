# Implementation Plan: ИИ-Судья Оценки Агентного Графа

**Branch**: `001-ai-judge` | **Date**: 2026-04-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from [specs/001-ai-judge/spec.md](spec.md)

## Summary

Реализовать модуль ИИ-судьи, который принимает агентный граф (bounded directed
graph), эталонный датасет и выдаёт отчёт по математической постановке
`S = Σ w_j · S_j` по каталогу метрик из
[docs/sdd/12-evaluation-metrics-catalog.md](../../docs/sdd/12-evaluation-metrics-catalog.md).

Архитектурно фича разрезана на три слоя: (1) Node.js бэкенд — REST, оркестрация
оценки, native-метрики, чат судьи и persisted checkpoint store; (2) Python-сайдкар
`judge-eval-worker` — reference-реализации Ragas/DeepEval/Detoxify/NLI, изолирован
за HTTP-JSON API; (3) PostgreSQL — схема `JudgeAssessment` / `MetricScore` /
`GoldAnnotation` / `JudgeConversation` и сопутствующие. Взаимодействие
судьи с пользователем повторяет поведение ветки `judge-agent` (`POST /judge/chat`,
`GET /judge/history` + tool-calls `getNode`/`getMetrics`/`getLogs`), но собрано
по слоистой архитектуре проекта — маршруты ходят только через `services/application/*`,
которые вызывают `services/data/*`, а ORM-доступ локализован в data-слое.
Судейский LLM спрятан за абстракцией `JudgeProvider` с адаптерами Mistral
(`ministral-3b-2410`) и OpenRouter, активный выбирается через env.

## Technical Context

**Language/Version**: TypeScript 5.9 на Node.js 20 (существующий backend); Python 3.11 для нового сайдкара `judge-eval-worker`.
**Primary Dependencies**:
- Backend (существующие): Express 5, Prisma 6, @prisma/client, jsonwebtoken, bcryptjs, cors, dotenv.
- Backend (новые): `@mistralai/mistralai` (адаптер `JudgeProvider`), `ajv` (для `f_schema`), `zhang-shasha`-совместимый TED-модуль (для `f_TED`, оценить выбор при реализации).
- Python sidecar (новые): FastAPI, pydantic, ragas, deepeval, detoxify, sentence-transformers, transformers, torch (CPU wheels).
**Storage**: PostgreSQL 14 (общая БД проекта). Checkpoint store персистентный — таблица `JudgeAssessmentItem` плюс `JudgeAssessmentInflight` с atomic upsert (аналог `in-flight` из `pipeline.executor.snapshot-store`). Артефакты прогонов и вложения сайдкара — в `backend/.artifacts/judge/…` (как `tool-executor`).
**Testing**: node-based smoke-скрипты (`*.mjs`) по паттерну существующего `test:integration` / `test:executor:*` / `test:contracts:freeze`. Для Python sidecar — pytest с golden-inputs snapshot'ами (компактно).
**Target Platform**: Linux-контейнеры через `docker-compose`; backend и frontend уже есть, добавляется сервис `judge-eval-worker` (профиль `app`) на внутренней сети `brainiac-network`. Порт сайдкара — внутренний, `http://judge-eval-worker:8001/…`, наружу не пробрасывается.
**Project Type**: Web application (backend + frontend + Python-сайдкар). Подпадает под Option 2 шаблона плюс вспомогательный Python-сервис.
**Performance Goals**: SC-001 — полный отчёт для 10 пар не дольше 5 минут при стандартных сетевых задержках LLM-провайдера; SC-006 — 100% циклических графов проходят без искажения `S`; SC-007 — сравнение двух оценок отдаётся за один вызов API.
**Constraints**:
- Асинхронная модель исполнения (FR-EXEC-001..004) — никакой блокирующий sync-endpoint.
- In-flight lock по `(pipeline_id, dataset_id)` с возвратом `409 Conflict` (FR-EXEC-005..006). (Поле `pipeline_version_id` зарезервировано в модели данных на случай введения `PipelineVersion` как отдельной pre-requisite feature, см. [data-model.md §0](data-model.md).)
- Per-item retry + backoff + persisted checkpoint (FR-EXEC-007..009).
- Bounded-размер датасета на ассессмент: `JUDGE_MAX_ITEMS_PER_ASSESSMENT` (по умолчанию 500), FR-EXEC-010.
- Строгая слоистость: route → application-service → data-service → Prisma (FR-ARCH-001).
- `JudgeConversation` персистент и привязан к `User` (FR-ARCH-002).
- Каждая метрика — наследник абстракции, регистрация через реестр, добавление новой метрики — без правки ядра (FR-012, SC-005).
- Сайдкар-зависимые метрики при недоступности сайдкара уходят в `unavailable` с классом `sidecar_unreachable`, оценка не падает (FR-EVAL-004).
**Scale/Scope**: учебная среда; первая итерация — десятки проектов, сотни пайплайнов, датасеты по 10–500 элементов, ≤ 5 параллельных `JudgeAssessment` в tenant; суммарно в MVP — ≥ 25 метрик, CRUD по `GoldAnnotation`, чат судьи.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Контроль против [.specify/memory/constitution.md](../../.specify/memory/constitution.md) (v1.0.0):

| Принцип | Оценка | Обоснование |
|---------|--------|-------------|
| I. Двухуровневая Согласованность Графа | PASS | Судья читает граф, не мутирует. Сам не создаёт `Edge`/`Node`. |
| II. Канонический Edge-Only Контракт Инструментов | PASS | Фича не касается `ToolNode -> AgentCall` path; tool-calls *внутри* `JudgeAgent` (`getNode`/`getMetrics`/`getLogs`) — это SDK-уровень LLM-судьи, НЕ ребра графа pipeline (другая плоскость). |
| III. Валидация При Мутации И Детерминированный Preflight | PASS | `POST /judge/assessments` MUST отвергать запрос, если Preflight по `pipeline_version_id` возвращает hard-ошибки. Rule-based `M'_0` детерминирован (FR-004). |
| IV. Ограниченное Исполнение | PASS | Assessment имеет `max_items_per_assessment`, per-item `max_attempts`, HTTP-таймаут на sidecar, бюджеты в `OperationalMetrics` (FR-EXEC-007..009, FR-EVAL-004). |
| V. Оценка Через Взвешенные Нормированные Метрики | CORE | Вся фича реализует `S = Σ w_j · S_j`, `f_j ∈ [0,1]`, `Σ w_j = 1`, пороги 0.6/0.8 (FR-006..017). |
| VI. Стабильность Публичного Контракта | PASS | Новые маршруты НЕ трогают замороженные `AgentCall.ui_json`, `ToolNode.ui_json`, `POST /pipelines/:id/execute`, `GET /pipelines/:id/executions/:executionId`, `AgentCall.output`, `tool_call_trace`. Добавляются `POST /judge/assessments`, `GET /judge/assessments/:id`, `POST /judge/chat`, `GET /judge/history`, `POST /datasets/:id/gold-annotations` и CRUD; они объявляются как **новые** публичные контракты в отдельном документе `contracts/`. |
| VII. Воспроизводимость И Наблюдаемость | PASS | `x-idempotency-key` replay (FR-EXEC-001), per-item checkpoint (FR-EXEC-008), polling `GET /judge/assessments/:id` (FR-EXEC-002), версионирование `NormalizationProfile` и `GoldAnnotation` (FR-019, FR-032b). |

**Результат**: все ворота пройдены, обоснованных отступлений нет. Записи в секции `Complexity Tracking` не требуются.

Дополнительные проверки из «Процесс Разработки И Контрольные Ворота» конституции:
- Новая фича не вводит `tool_ref`/`tool_refs`.
- Все новые циклы (если появятся в примерах workflow) должны иметь loop-policy — данная фича циклов в runtime не вводит, только читает циклические пайплайны.
- Нормировка всех новых метрик — на `[0, 1]` явно зафиксирована (FR-006).
- Trace-артефакты для runtime ветки: `JudgeAssessmentItem.run_task_id` + `tool_call_trace` источника.

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-judge/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── routes/
│   │   └── resources/
│   │       ├── judge/                       # новый: /judge/chat, /judge/history
│   │       │   └── judge.chat.routes.ts
│   │       ├── judge_assessment/            # новый: /judge/assessments[/:id]
│   │       │   └── judge_assessment.routes.ts
│   │       └── gold_annotation/             # новый: /datasets/:id/gold-annotations, /gold-annotations/:id
│   │           └── gold_annotation.routes.ts
│   ├── services/
│   │   ├── application/
│   │   │   ├── judge/                       # новый: оркестрация assessment и chat
│   │   │   │   ├── judge_assessment.application.service.ts
│   │   │   │   ├── judge_chat.application.service.ts
│   │   │   │   ├── metric_registry.ts       # реестр метрик (native + sidecar, FR-012)
│   │   │   │   ├── weight_profile.service.ts
│   │   │   │   ├── axis_coverage.service.ts
│   │   │   │   └── metrics/                 # абстракция + реализации
│   │   │   │       ├── metric.base.ts
│   │   │   │       ├── correctness/
│   │   │   │       ├── grounding/
│   │   │   │       ├── retrieval/
│   │   │   │       ├── tool_use/
│   │   │   │       ├── structure/
│   │   │   │       ├── control_flow/
│   │   │   │       ├── llm_judge/
│   │   │   │       └── safety/
│   │   │   └── gold_annotation/             # новый: application-слой эталонов
│   │   │       └── gold_annotation.application.service.ts
│   │   ├── core/
│   │   │   ├── judge_provider/              # новый: абстракция LLM-судьи
│   │   │   │   ├── judge_provider.ts        # interface
│   │   │   │   ├── mistral.adapter.ts
│   │   │   │   └── openrouter.adapter.ts    # переиспользует core/openrouter/
│   │   │   └── eval_worker/                 # новый: клиент к Python-сайдкару
│   │   │       └── eval_worker.client.ts
│   │   └── data/
│   │       ├── judge_assessment.service.ts  # новый: Prisma-доступ к assessment
│   │       ├── judge_assessment_item.service.ts
│   │       ├── judge_assessment_inflight.service.ts
│   │       ├── judge_conversation.service.ts
│   │       ├── metric_definition.service.ts
│   │       ├── metric_score.service.ts
│   │       ├── weight_profile.service.ts
│   │       ├── normalization_profile.service.ts
│   │       └── gold_annotation.service.ts
│   └── db.ts                                # общий Prisma client (существующий)
├── prisma/
│   ├── schema.prisma                        # +модели judge-слоя (см. data-model.md)
│   └── migrations/
│       └── 2026xxxx_add_judge_models/       # новая миграция
└── scripts/
    ├── judge-assessment-e2e-test.mjs        # новый: end-to-end smoke
    ├── judge-chat-smoke-test.mjs
    └── judge-eval-worker-contract-test.mjs  # контракт backend ↔ sidecar

judge-eval-worker/                           # новый Python-сайдкар (корень)
├── pyproject.toml
├── Dockerfile
├── app/
│   ├── main.py                              # FastAPI entrypoint
│   ├── api/
│   │   └── metrics.py                       # POST /metrics/{metric_code}
│   ├── metrics/
│   │   ├── ragas_adapter.py
│   │   ├── detoxify_adapter.py
│   │   └── nli_adapter.py
│   └── contracts/
│       └── schemas.py                       # pydantic-модели входа/выхода
└── tests/
    └── test_metrics_golden.py

docker-compose.yaml                          # + сервис judge-eval-worker (профиль app)

frontend/                                    # ВНЕ scope этой фичи — UI-надстройка выделяется в отдельную последующую спеку
```

**Structure Decision**: расширение существующей Web Application (Option 2
шаблона) + Python-сайдкар как самостоятельный контейнер. Обоснование в секции
Summary: Node/Prisma остаются единой плоскостью оркестрации и данных, Python
появляется только как runtime reference-фреймворков с HTTP-границей.

## Post-Design Constitution Re-check

Проведено после Phase 1 (данные модели, контракты, quickstart) —
все 7 принципов по-прежнему `PASS`:

- Phase 1 не вводит новых `Edge`/`Node` мутаций и не меняет `ToolNode -> AgentCall`
  путь (принципы I, II).
- Preflight-гейт закреплён в контракте `POST /judge/assessments` (`422
  JUDGE_ASSESSMENT_PREFLIGHT_FAILED`, R9) — принцип III.
- Bounded execution явно кодифицирован через `JudgeAssessment.total_items`,
  `JudgeAssessmentItem.attempt_count`, таймаут сайдкара, inflight stale-policy —
  принцип IV.
- `MetricScore.value` инвариант `[0, 1]` зафиксирован в data-model §5, а
  `WeightProfile.weights_json` содержит проверку `Σ = 1` (§6) — принцип V.
- Новые контракты (`contracts/*.md`) заведены как явные публичные поверхности,
  frozen-контракты из `11-backend-contract-freeze.md` не тронуты — принцип VI.
- `JudgeAssessmentFrozenGold`, `NormalizationProfile.version`,
  `JudgeAssessment.idempotency_key`, polling `GET /judge/assessments/:id` —
  принцип VII.

Никаких обоснованных отступлений (Complexity Tracking) не требуется.

## Complexity Tracking

Не применимо: Constitution Check пройден без отступлений. Компоненты, которые
могли бы считаться избыточными:

- **Python-сайдкар** — введён обосновано через Q4 clarifications и закрыт
  FR-EVAL-001..005. Альтернатива (pure Node-переписывание промптов Ragas)
  отклонена из-за академической цены в thesis-контексте.
- **Абстракция `JudgeProvider` с двумя адаптерами** — введена обосновано через
  Q3 clarifications (spec) и принцип VI (anti-bias: судья из иного семейства, чем runtime-LLM).
  Альтернатива (hard-wired Mistral) отклонена как противоречащая
  FR-ARCH-003 и каталогу метрик (раздел Anti-Bias).
