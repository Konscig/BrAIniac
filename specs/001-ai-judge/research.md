# Phase 0 Research: ИИ-Судья Оценки Агентного Графа

**Feature**: `001-ai-judge`
**Date**: 2026-04-23

## Назначение

Отразить решения по технологиям и паттернам, на которые опирается
реализационный план. Все `[NEEDS CLARIFICATION]` маркеры спецификации
закрыты на фазе `/speckit.clarify` — здесь фиксируются производные
решения для каждого зависимого компонента.

Формат каждой записи: **Decision** → **Rationale** → **Alternatives considered**.

---

## R1. Python-сайдкар как изолированный HTTP-сервис

**Decision**: Ввести новый сервис `judge-eval-worker` на Python 3.11 / FastAPI,
поднимаемый через `docker-compose` в общем профиле `app`. Node-backend
обращается к нему по HTTP-JSON через выделенный клиент
`services/core/eval_worker/eval_worker.client.ts`. Python-зависимости
(`ragas`, `deepeval`, `detoxify`, `sentence-transformers`, `transformers`,
`torch` CPU) живут только в образе сайдкара.

**Rationale**:
- Q4 clarification прямо зафиксировал Option B (sidecar) как академически
  обоснованный выбор для thesis-контекста: reference-имплементация Ragas
  доступна только через Python-библиотеки.
- Паттерн «внешний HTTP-executor с JSON» уже применён в проекте
  (`POST /tool-executor/contracts` из snapshot backend-runtime-truth).
  Повторное применение снижает архитектурный шум.
- Изоляция Python за HTTP-границей не позволяет Python-зависимостям
  протечь в Node (FR-EVAL-002) и упрощает локальный dev (`docker-compose up`).
- Health-check сайдкара → деградация к `unavailable` без падения оценки
  (FR-EVAL-004) — тот же failure-паттерн, что у `tool-executor`.

**Alternatives considered**:
- *Option A из Q4* (pure Node через LLM-промпты вместо Ragas): отклонён из-за
  академической цены — in-house порт промптов не эквивалентен reference
  Ragas, а валидация Kendall `τ ≥ 0.4` (SC-004) требует предсказуемого
  bias'а измерений.
- *Inline Python через child_process*: отклонён — ломает изоляцию
  тестирования, тянет Python в dev-установку Node-разработчика, создаёт
  конфликт с ESM-пайплайном Node.
- *Managed сервисы (Ragas Cloud)*: отклонён — стороннее API, плата,
  приватность учебных датасетов.

---

## R2. Контракт backend ↔ sidecar

**Decision**:
- HTTP метод и путь: `POST http://judge-eval-worker:8001/metrics/{metric_code}`.
- Сайдкар принимает `{ inputs, config }` с полями, специфичными для метрики,
  и возвращает `{ value: number in [0,1], details?, warnings? }`.
- Общий health: `GET /health` возвращает `200 OK` + `{ status: "ok", version }`
  только когда все инициализированные модели загружены.
- Таймаут на вызов: 30 секунд по умолчанию, настраивается через env
  `JUDGE_EVAL_WORKER_TIMEOUT_MS`.
- Ретрай на уровне клиента: 2 попытки с фиксированным backoff 500 мс только
  для сетевых ошибок / 502 / 504; на 4xx не ретраит.

**Rationale**:
- REST-ресурсный путь `/metrics/{code}` позволяет реализовывать новую
  метрику в сайдкаре как новый обработчик без изменения контракта других
  метрик.
- Нормализация в `[0, 1]` на стороне сайдкара (FR-EVAL-005) разгружает
  Node от метрик-специфичного rescaling.
- Ограниченный ретрай (только idempotent сетевые ошибки) совпадает с
  поведением существующего `openrouter.adapter`.

**Alternatives considered**:
- Единый `POST /metrics` с дискриминатором по коду внутри body: отклонён —
  осложнит ведение API-схем и gRPC-like валидацию.
- WebSocket / streaming: избыточно для MVP, объём вычислений на сайдкаре
  укладывается в одиночный request/response.

---

## R3. Абстракция `JudgeProvider` и выбор адаптеров

**Decision**: Ввести интерфейс `JudgeProvider` в
`services/core/judge_provider/judge_provider.ts` со следующими методами:
`chat(messages, tools)`, `supportsToolCalls`, `modelId`, `family`.
Реализации: `MistralJudgeProviderAdapter` (`@mistralai/mistralai`,
модель `ministral-3b-2410` по умолчанию, как в референсе) и
`OpenRouterJudgeProviderAdapter` (переиспользует существующий
`services/core/openrouter/openrouter.adapter.ts`).
Активный провайдер выбирается через env `JUDGE_PROVIDER` ∈ `mistral` / `openrouter`.

**Rationale**:
- FR-ARCH-003: разделение tool-calls регистрации и адаптера провайдера
  позволяет сервису судьи получать `JudgeProvider` через DI без знаний
  о конкретном SDK.
- Политика anti-bias каталога метрик (раздел «Политика Судьи (Anti-Bias)»):
  судейский провайдер SHOULD быть настроен на иное семейство, чем
  runtime-LLM. Интерфейс позволяет переключать провайдер без изменений
  в маршрутах и сервисах.

**Alternatives considered**:
- Hard-wired Mistral (как на `judge-agent`): отклонено — делает невозможным
  переход на OpenRouter и нарушает FR-ARCH-003.
- Один адаптер с внутренним if-else по env: отклонено — ровно та же
  сложность, но без границ типов.

---

## R4. Persisted Checkpoint Store для оценок

**Decision**: Хранить прогресс per-item в таблице `JudgeAssessmentItem`
(см. data-model). Состояние: `pending | running | completed | skipped | failed`.
Fairness и claim — через отдельную таблицу `JudgeAssessmentInflight` с полями
`pipeline_version_id`, `dataset_id`, `assessment_id`, `updated_at` и уникальным
индексом по паре `(pipeline_version_id, dataset_id)` с предикатом «статус
активный». Atomic claim — через Prisma `$transaction` + `SELECT ... FOR UPDATE`
или unique-upsert по составному индексу (выбор в процессе реализации
`prisma.migrate`).

**Rationale**:
- Повторяет существующий паттерн `pipeline.executor.snapshot-store` с
  `in-flight` + `idempotency` + stale-policy по `updated_at`
  (принцип VII конституции, FR-EXEC-005..008).
- Постгрес + `FOR UPDATE` достаточно для уровня параллелизма учебной среды
  (≤ 5 одновременных оценок), не требуется Redis или отдельный lock-сервис.
- Row-level state позволяет replay по `x-idempotency-key` возобновлять
  работу с первого non-terminal элемента (FR-EXEC-008) без отдельного
  файлового снапшота.

**Alternatives considered**:
- Файловый checkpoint в `.artifacts/judge/…` (как executor): отклонено —
  у нас уже есть БД, а per-item прогресс удобнее запрашивать SQL-ом, чем
  читать файлы.
- Advisory locks Postgres: равнозначно по мощности, но менее наглядно для
  отладки; таблица `JudgeAssessmentInflight` читается обычным SELECT.

---

## R5. Абстракция метрики и реестр

**Decision**: Ввести абстракцию `MetricBase` в
`services/application/judge/metrics/metric.base.ts`:

```ts
abstract class MetricBase {
  abstract readonly code: string;              // стабильный код f_EM и т.д.
  abstract readonly axis: QualityAxis;         // ось A..H
  abstract readonly requiresReference: boolean;
  abstract readonly executor: 'native' | 'sidecar';
  abstract compute(ctx: MetricContext): Promise<MetricResult>;
}
```

`MetricContext` содержит данные прогона (элемент датасета, ответ агента,
context, tool_call_trace, GoldAnnotation) и API-клиенты (`JudgeProvider`,
`EvalWorkerClient`). `MetricResult` — `{ value: number /* [0,1] */,
details?, warnings? }`.

Конкретные метрики — файлы-наследники в тематических папках:
`metrics/correctness/exact-match.metric.ts` и т.п. Подключение новой
метрики = импорт в `metric_registry.ts` + регистрация (1 строка).

**Rationale**:
- Покрывает FR-012 (абстрактный класс, подключение без правок ядра) и
  SC-005 (внедрение новой метрики ≤ 1 файл + 1 регистрация).
- Единая точка вычисления позволяет унифицированно применять нормализацию,
  timing, ошибки ретраев и audit trail.

**Alternatives considered**:
- Функциональный подход без классов (каждая метрика — чистая функция):
  формально эквивалентно, но наследование уже было обозначено
  пользовательским вводом; класс удобнее для статического реестра по
  `metric.code` и для общего lifecycle (`prepare`/`compute`/`finalize`).
- Полиморфизм на уровне AST/typescript-generic: избыточно для MVP.

---

## R6. Политика per-item retry + backoff

**Decision**:
- `max_attempts_per_item = 3` по умолчанию (настраивается через env
  `JUDGE_MAX_ATTEMPTS_PER_ITEM`).
- Backoff: экспоненциальный от `soft_retry_delay_ms = 800` с множителем 2
  и jitter 0–200 мс; max cap = 10 секунд.
- Ретраятся только сетевые ошибки и soft-failures провайдера (429, 502,
  503, 504, таймауты). 4xx/валидационные — немедленно в `skipped` с
  классом отказа.
- Таксономия отказов приводится к списку из каталога метрик:
  `timeout` / `tool error` / `parsing violation` / `budget exhaustion` /
  `hallucinated tool` / `infinite loop` / `safety abort`. Маппинг
  ошибка → класс задаётся в `eval_worker.client` и в
  `judge_provider.*.adapter`.

**Rationale**:
- Совпадает с `softRetryDelayMs = 1200` и `maxAttempts = 3` из freeze
  контракта `AgentCall.ui_json`.
- 3 попытки с exponential backoff достаточно для soft-failures внешнего
  LLM-провайдера без раздувания стоимости (принцип IV конституции).

**Alternatives considered**:
- Unbounded retry (пока не ответит): отклонено — нарушает Bounded
  Execution, опасно по стоимости.
- Ровно 1 попытка без retry: отклонено — существующая практика проекта
  уже включает soft-retry, пользователю будет странно, что судья
  строже, чем runtime.

---

## R7. Нормализация метрик `[0, 1]` и `NormalizationProfile`

**Decision**: `NormalizationProfile` — версионируемая запись (один ряд
на `(profile_name, version)`) с полями `params_json` вида:

```json
{
  "f_TED": { "max_tree_size": 128 },
  "f_judge_ref": { "scale": 5 },
  "latency_like": { "x_min": 50, "x_max": 20000, "p5": 120, "p95": 8000 }
}
```

Для метрик MVP с нативными ограничениями (`f_EM`, `f_F1`, `f_schema` и т.п.)
параметры нормализации пусты. Для неограниченных (`f_TED`, latency, cost,
tokens) используется inverse min-max с clipping по p5/p95 согласно
каталогу метрик (раздел «Нормализация Метрик на Отрезок [0, 1]»).
Текущий профиль приклеивается к `JudgeAssessment.normalization_profile_id`,
что исключает «переоценку задним числом» (принцип VII).

**Rationale**:
- Принцип VII конституции и FR-019 требуют версионирования нормализации.
- Выделенная таблица позволяет калибровать параметры на отдельных датасетах
  без мутации текущих профилей.

**Alternatives considered**:
- Хранить параметры в `env`: теряется воспроизводимость и аудит.
- Использовать Postgres array/jsonb для per-assessment overrides: избыточно
  для MVP, достаточно references на именованный профиль.

---

## R8. Взвешенные профили (`WeightProfile`) и архитектурные шаблоны

**Decision**: Предзагружать 4 шаблонных `WeightProfile` (миграция
+ seed): `rag`, `tool_use`, `extractor`, `judge`. Каждому архитектурному
классу соответствует словарь `w_j` по кодам метрик, согласованный с
рекомендациями из каталога метрик (раздел «Субъективный Вес w_j^AHP»).
Веса рассчитаны по пропорциям, известным из AHP-шаблонов каталога,
нормализованы к `Σ w_j = 1`.

Определение активного шаблона для пайплайна — rule-based по составу
узлов: наличие `AgentCall` + tool-nodes → `tool_use`; наличие
`HybridRetriever`/`ContextAssembler`/`LLMAnswer` → `rag`; наличие
`Parser` без `AgentCall` → `extractor`; наличие узла, помеченного как
`judge` → `judge`. Приоритет: `judge > tool_use > rag > extractor`.

MVP не реализует полноценный AHP-опросник и CRITIC-пересчёт (FR-014 = SHOULD,
активируется при `N ≥ 50`). Этот шаг остаётся follow-up'ом.

**Rationale**:
- FR-013 (стартовые веса по архитектурному классу).
- Детерминированное определение класса (FR-004) без ML / LLM-чтения графа.
- Закрывает 100% MVP use-case (RAG-агент) без блокирующих зависимостей.

**Alternatives considered**:
- Полноценный AHP-опросник в MVP: отклонён — требует UI-слоя и
  human-in-the-loop, что перегружает MVP.
- Равномерные веса `w_j = 1/p`: отклонены — противоречат каталогу
  (раздел AHP шаблоны) и снижают интерпретируемость `S`.

---

## R9. Интеграция с Preflight

**Decision**: `POST /judge/assessments` в application-сервисе вызывает
существующий preflight через `services/core/graph_validation.service.ts`
с `preset = default` (или указанным в запросе). При наличии hard-ошибок
assessment MUST не создаваться; возвращается `422 Unprocessable Entity` с
телом `{ preflight_errors: [...] }`. Предупреждения Preflight копируются
в `JudgeAssessment.preflight_warnings_json` и отражаются в финальном отчёте.

**Rationale**:
- Принцип III конституции + FR-005: судья оценивает только валидный граф.
- Детерминизм Preflight (из `05-preflight-contract.md`) гарантирует
  воспроизводимость `M'_0` (FR-004).

**Alternatives considered**:
- Не проверять Preflight: отклонено — нарушает принцип III и даёт
  возможность оценивать заведомо сломанный граф.
- Встраивать валидацию графа внутрь `judge_assessment.application.service`:
  отклонено — дублирование существующего `graph_validation.service`.

---

## R10. Выбор библиотеки для `f_TED`

**Decision**: Использовать npm-пакет `tree-edit-distance` (или альтернативу
с аналогичным API) для вычисления unordered/ordered tree edit distance
в Node-реализации `f_TED`. Выбор конкретного пакета фиксируется на этапе
`/speckit.tasks` по критериям: покрытие алгоритма Zhang–Shasha, лицензия
MIT/Apache-2.0, отсутствие тяжёлых нативных зависимостей, актуальный
maintenance.

**Rationale**:
- Zhang–Shasha — стандартный алгоритм, совпадает с формулой из каталога
  метрик (`1 − TED / max_tree_size`).
- Нативная Node-реализация не требует сайдкара (FR-EVAL-003:
  `f_TED` классифицирован как `native`).

**Alternatives considered**:
- Перенести `f_TED` в Python-сайдкар: отклонено — простая алгоритмическая
  метрика без ML, не оправдывает сетевого вызова.
- Свой инхаус-Zhang–Shasha: отклонено — лишняя ответственность.

---

## R11. Persistent `JudgeConversation`

**Decision**: Таблица `JudgeConversation` + дочерняя `JudgeMessage`.
Поля `JudgeMessage`: `role ∈ {user, assistant, tool}`, `content`, `tool_name?`,
`tool_call_id?`, `created_at`. Ссылка на `User` и опционально на
`JudgeAssessment`. Инстанс `JudgeAgent` (backend-сервис судьи) не хранит
состояние в полях — история поднимается из БД по `conversation_id` при
каждом вызове `POST /judge/chat`.

**Rationale**:
- FR-024 + FR-ARCH-002: process-local история недопустима.
- Ретроспективный аудит: преподаватель может открыть историю разборов
  студента.
- Поддержка привязки диалога к конкретному `JudgeAssessment` открывает
  сценарий "объясни эту оценку".

**Alternatives considered**:
- Redis-session: отклонено — новый компонент стека, не нужен для MVP.
- Inline JSON в поле User/Project: отклонено — плохо масштабируется и
  нарушает нормализацию.

---

## R12. `GoldAnnotation` и обратная совместимость отчётов

**Decision**:
- Версионирование — поле `version: int` и флаг `current: boolean` внутри
  `GoldAnnotation`; уникальность `(document_id, annotation_type, version)`.
  Новая ревизия создаёт новую строку и снимает флаг `current` с предыдущих.
- `JudgeAssessment` при создании фиксирует `frozen_gold_annotation_ids: int[]`
  на момент запуска, чтобы последующее редактирование эталонов не
  перекроило уже завершённые оценки.

**Rationale**:
- FR-032 требует версионирования без потери ссылок.
- Поведение аналогично `PipelineVersion.lastPublishedVersionId`: снимок на
  момент запуска.

**Alternatives considered**:
- Мутировать запись на месте + лог изменений: отклонено — ломает
  воспроизводимость отчётов.
- Soft-delete + create-new-row без явного поля `current`: эквивалентно,
  но менее читабельно; добавление `current` упрощает часто запрашиваемый
  «выбор последней версии».

---

## R13. Политика безопасности и доступов (отсроченный Outstanding из /clarify)

**Decision (первичный контур)**:
- Все новые маршруты (`/judge/*`, `/datasets/:id/gold-annotations`,
  `/gold-annotations/:id`) MUST проходить существующий middleware
  `auth.middleware.ts` (JWT-требование из `services/core/auth.service.ts`).
- Ownership проверяется через существующий `services/core/ownership.service.ts`:
  пользователь видит только `JudgeAssessment`/`JudgeConversation`/
  `GoldAnnotation`, принадлежащие его `Project` (наследуемо через
  `Pipeline.fk_project_id`).
- Cross-project чтение запрещено и возвращает `404` (не `403`), чтобы
  не утекало существование чужих оценок.

**Rationale**:
- Существующий стек уже содержит ownership-проверки; не придётся строить
  новую модель доступа.
- `404` вместо `403` — стандартная практика «information disclosure
  prevention».

**Alternatives considered**:
- Полноценный RBAC с ролями teacher/student: отсрочено — в текущих
  Prisma-моделях роли не заведены; вводить ролевой слой ради MVP не
  оправдано.

---

## Закрытые пункты спецификации

| ID | Статус | Источник решения |
|----|--------|------------------|
| FR-031 (MVP metric scope) | Resolved | Round 1 clarifications (Q1 `/speckit.specify`), зафиксировано в spec |
| FR-032 (источник эталонов) | Resolved | Round 1 clarifications (Q2 `/speckit.specify`) + R12 |
| Assumptions judge LLM | Resolved | Round 1 clarifications (Q3 `/speckit.specify`) + R3 |
| Async execution model | Resolved | Round 2 clarifications Q1 + R4 |
| Concurrency policy | Resolved | Round 2 clarifications Q2 + R4 |
| Failure recovery | Resolved | Round 2 clarifications Q3 + R6 |
| External frameworks | Resolved | Round 2 clarifications Q4 + R1, R2 |
| GoldAnnotation API | Resolved | Round 2 clarifications Q5 + R12 |
| Security & Privacy | Partial | R13 (базовый контур) — полноценная модель ролей отсрочена за пределы MVP |

Все критические unknown закрыты; переход к Phase 1 допустим.
