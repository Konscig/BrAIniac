<!--
Sync Impact Report
Version change: 0.0.0 (template placeholders) → 1.0.0 (initial ratification)
Bump rationale: First concrete ratification — replaces placeholder template with a
full set of principles, technology constraints, workflow gates, and governance rules
derived from docs/sdd (01..12). MAJOR per policy, because this establishes the
baseline normative contract for the project.

Modified principles (renamed from template placeholders → new titles):
- [PRINCIPLE_1_NAME] → I. Двухуровневая Согласованность Графа
- [PRINCIPLE_2_NAME] → II. Канонический Edge-Only Контракт Инструментов
- [PRINCIPLE_3_NAME] → III. Валидация При Мутации И Детерминированный Preflight (NON-NEGOTIABLE)
- [PRINCIPLE_4_NAME] → IV. Ограниченное Исполнение (Bounded Execution)
- [PRINCIPLE_5_NAME] → V. Оценка Через Взвешенные Нормированные Метрики
Added principles:
- VI. Стабильность Публичного Контракта
- VII. Воспроизводимость И Наблюдаемость

Added sections:
- Технологические И Качественные Ограничения (replaces [SECTION_2_NAME])
- Процесс Разработки И Контрольные Ворота (replaces [SECTION_3_NAME])

Removed sections: none (all template placeholder slots filled).

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — Constitution Check gate is referenced;
      existing "[Gates determined based on constitution file]" placeholder correctly
      defers to this file and does not need a content change.
- ✅ .specify/templates/spec-template.md — No principle-driven mandatory sections
      added; no change required.
- ✅ .specify/templates/tasks-template.md — Task categories (Setup / Foundational /
      per-story) remain compatible; no change required.
- ✅ .specify/templates/commands/*.md — Directory not present in repo; no action.
- ✅ README.md, docs/sdd/* — Project-level docs; constitution references them as
      normative sources. No edits needed for this ratification.

Follow-up TODOs: none. Ratification date is set to today (2026-04-23) because this
is the first adoption of a concrete constitution.
-->

# BrAIniac Constitution

## Core Principles

### I. Двухуровневая Согласованность Графа

Архитектура BrAIniac MUST поддерживать ровно два уровня согласованности,
и эти уровни MUST NOT смешиваться:

- Уровень 1 — модель данных и канва: `Node` и `Edge` образуют управляемый
  циклический направленный граф (Bounded Directed Graph) одного pipeline.
  Внешний граф MAY содержать циклы и MAY иметь несколько стартовых узлов.
- Уровень 2 — runtime узла: `AgentCall` MAY выполнять внутренний bounded-цикл
  и tool calls. Внутренние вызовы инструментов MUST NOT создавать записи в
  `Edge` и MUST NOT менять топологию внешнего графа.

Циклы внешнего графа допустимы между любыми loop-capable NodeType (включая
`transform` и tool-like узлы), а не только между `control`-узлами.

Rationale: двухуровневая модель устраняет неоднозначность между графовой
семантикой pipeline и runtime-семантикой агента, и является единственной
формой, при которой каталог метрик из `docs/sdd/12-evaluation-metrics-catalog.md`
остаётся математически корректным.

### II. Канонический Edge-Only Контракт Инструментов

Инструменты MUST становиться доступными агенту только через канонический путь
`ToolNode -> AgentCall`.

- `AgentCall` MUST получать callable tools исключительно через входящие рёбра графа.
- `AgentCall` MUST NOT иметь скрытого локального каталога callable tools.
- Любые input-based механики вида `tool_ref` / `tool_refs` MUST NOT использоваться
  как runtime-путь и не считаются допустимым frontend-путём.
- `ToolNode` без входов MUST работать в capability-режиме и публиковать
  advertising output для `AgentCall`.

Rationale: единственный путь публикации инструментов делает agent graph
проверяемым статически (Preflight + mutation-time валидация), а trace —
пригодным для оценки через `f_toolsel`, `f_argF1`, `f_trajIoU`, `f_planEff`,
`f_redund`, `f_node_cov`.

### III. Валидация При Мутации И Детерминированный Preflight (NON-NEGOTIABLE)

Корректность графа MUST проверяться при изменении графа, а не только перед запуском.

- Операции `create node`, `update node`, `delete node`, `create edge`, `delete edge`
  MUST выполнять hard-валидацию перед записью.
- Preflight (`POST /pipelines/:id/validate-graph`) MUST выполнять полную проверку
  графа и возвращать детерминированную диагностику: `errors[]`, `warnings[]`,
  `metrics`.
- Для одинакового графа и одинакового набора профилей ответ Preflight MUST быть
  бит-в-бит детерминированным.
- Hard-правила `H1..H5` из `docs/sdd/02-graph-constitution.md` MUST блокировать
  запись или запуск. Soft-правила (`S1..S5`) MUST возвращать только предупреждения.
- Коды ошибок и предупреждений из `docs/sdd/04-validation-errors.md` являются
  стабильной частью API-контракта: семантика кода MUST NOT меняться без
  major-амендмента этой конституции.
- Режим валидации MUST определяться только `preset` (`default | dev | production`);
  legacy-поля (`mode`, `includeWarnings`, `profileFallback`, `enforceLoopPolicies`,
  `requireExecutionBudgets`, `roleValidationMode`) MUST отклоняться.

Rationale: ранняя валидация предотвращает «проходящие» графы, которые падают
только на прогоне; детерминизм Preflight — предпосылка воспроизводимой оценки
агента (`S = Σ w_j · S_j`).

### IV. Ограниченное Исполнение (Bounded Execution)

Любое исполнение MUST быть ограничено явными бюджетами. Неограниченных циклов и
неограниченных агентных стратегий MUST NOT существовать.

- Каждый цикл внешнего графа MUST иметь loop-policy с `maxIterations ≥ 1`
  в JSON-профиле. Отсутствие или `maxIterations ≤ 0` MUST возвращать
  `GRAPH_LOOP_MAX_ITER_INVALID`.
- Unguarded-циклы MUST блокировать запуск (`GRAPH_UNGUARDED_CYCLE`).
- `AgentCall` MUST иметь bounded limits:
  `maxAttempts`, `maxToolCalls`, `maxTimeMs`, `maxCostUsd`, `maxTokens`.
- В production-preset глобальные бюджеты исполнения run (`maxSteps`, `maxTimeMs`,
  `maxCost`, `maxTokens`) MUST быть заданы; их отсутствие MUST возвращать
  warning `GRAPH_EXECUTION_BUDGET_MISSING` в `default`/`dev` и ошибку в `production`.
- `AgentCall.output` envelope MUST нести поля наблюдаемости лимитов:
  `attempts_used`, `tool_calls_executed`, `max_attempts`, `max_tool_calls`, `usage`.

Rationale: образовательная среда работает на внешних LLM-провайдерах и должна
быть экономически и временно предсказуемой; метрики `f_loop_term`, `f_loop_budget`,
`f_loop_conv`, `f_iter_dispersion`, `f_retry` корректны только на bounded runs.

### V. Оценка Через Взвешенные Нормированные Метрики

Оценка агента MUST следовать математической постановке из
`docs/sdd/12-evaluation-metrics-catalog.md`:

- Итоговая оценка агента: `S = Σ_{j=1}^{p} w_j · S_j`, где
  `S_j = (1/m) · Σ_{k=1}^{m} f_j(a(x_k), y_k)`.
- Каждая метрика `f_j` MUST быть нормализована на отрезок `[0, 1]`.
- Веса `W = {w_1..w_p}` MUST удовлетворять `Σ w_j = 1` и MUST быть
  интерпретируемыми (каждый вес привязан к оси качества и узлу графа).
- Подмножество метрик `M' ⊆ M` MUST формироваться из rule-based baseline
  `M'_0` (объединение рекомендованных подмножеств по ролям узлов), с последующим
  data-driven прунингом при `N ≥ 50` прогонах на эталонном датасете.
- Обязательные оси (`Correctness`, `Grounding` при наличии контекстного пути,
  `Tool-Use` при наличии `AgentCall`, `Structure` при structured output,
  `Safety`) MUST иметь хотя бы одну метрику в `M'_0`.
- Операционные ограничения `T(a)`, `C(a)`, `R_fail(a)` MUST логироваться отдельно
  от качественной оценки `S` и MUST NOT включаться в `Σ w_j · S_j`.
- Пороги интерпретации: `S < 0.6` — доработка; `0.6 ≤ S ≤ 0.8` — удовлетворительно;
  `S > 0.8` — проход. Эти пороги MAY калиброваться, но методология порогов MUST
  документироваться в артефакте оценки.
- Нормализационные параметры (min/max, перцентили) и веса SHOULD быть
  версионированы вместе с профилем оценки.

Rationale: LLM-as-Judge и модель-судья BrAIniac являются продуктовым
дифференциатором; без единой нормализации и прозрачного взвешивания оценка
не воспроизводима между студентами и кейсами.

### VI. Стабильность Публичного Контракта

Публичные backend-контракты, зафиксированные в
`docs/sdd/11-backend-contract-freeze.md`, считаются замороженной поверхностью
для frontend и внешних интеграций.

- Замороженные формы (`AgentCall.ui_json`, `ToolNode.ui_json`,
  `POST /datasets/upload`, `POST /pipelines/:id/execute`,
  `GET /pipelines/:id/executions/:executionId`, `AgentCall.output`,
  `tool_call_trace`) MUST изменяться только через документированный амендмент
  этой конституции и соответствующее повышение `CONSTITUTION_VERSION`.
- Разрывное изменение замороженного поля MUST сопровождаться migration notes и
  MUST получать MAJOR-bump конституции.
- Internal-детали (`artifact_manifest`, snapshot layout в `.artifacts/runtime/...`,
  process-local cache) MUST NOT объявляться как frontend-контракт.
- Legacy-формы (`tool_ref` / `tool_refs`, top-level `ui_json.tool_id`,
  input-based объявления tools) MUST NOT вводиться в новые фичи.
- Freeze MUST непрерывно подтверждаться тестами:
  `npm --prefix backend run test:contracts:freeze`,
  `npm --prefix backend run test:executor:http`,
  `npm --prefix backend run test:executor:coordination`.

Rationale: frontend, генерация отчётов и экспорт кода опираются на стабильный
shape; дрейф контракта делает экспортированный код невоспроизводимым.

### VII. Воспроизводимость И Наблюдаемость

Каждый run pipeline MUST давать достаточный след для воспроизводимой оценки
и отладки.

- Каждое выполнение `AgentCall` MUST заполнять `tool_call_trace` с полями
  `index`, `requested_tool`, `resolved_tool?`, `source`, `status`, `output?`,
  `error?`; `status ∈ {completed, failed, not_found}`.
- `POST /pipelines/:id/execute` MUST поддерживать idempotent replay через
  заголовок `x-idempotency-key`: повтор с тем же ключом MUST возвращать тот же
  `execution_id`.
- `GET /pipelines/:id/executions/:executionId` MUST быть пригоден для polling и
  MUST отдавать стабильный набор верхнеуровневых полей (`execution_id`,
  `pipeline_id`, `status`, `created_at`, `updated_at`, `started_at?`,
  `finished_at?`, `request`, `preflight?`, `summary?`, `warnings?`, `error?`).
- Oversized manifests и execution snapshots MAY externalize'иться в файловый слой
  `.artifacts`; snapshot MUST читаться polling-ом даже если текущий worker не
  держит job в памяти.
- Логи прогонов SHOULD сохраняться с достаточной гранулярностью для
  последующей data-driven калибровки весов `W` (M5 из каталога метрик).
- Нормализационные параметры метрик SHOULD быть версионированы совместно с
  профилем оценки (M6).

Rationale: тезис BrAIniac — учебная среда с объяснимой оценкой. Без полного,
воспроизводимого trace учебный отчёт студента не имеет доказательной силы.

## Технологические И Качественные Ограничения

Стек и baseline, считающиеся нормативными на текущем этапе:

- Backend: Node.js + TypeScript, Prisma в качестве ORM, HTTP-JSON executor
  (`POST /tool-executor/contracts`). `POST /tool-executor/contracts` MUST NOT
  маскировать `HttpError` в `200 OK`.
- Frontend: веб-приложение; публичные контракты читаются только из
  `docs/sdd/11-backend-contract-freeze.md`.
- Runtime handlers MUST быть реализованы для: `Trigger`, `ManualInput`,
  `DatasetInput`, `PromptBuilder`, `Filter`, `Ranker`, `LLMCall`, `AgentCall`,
  `ToolNode`, `Parser`, `SaveResult`.
- Managed dataset upload path MUST работать через `POST /datasets/upload` с
  `filename + content_base64`; поддерживаемые форматы v1: `.txt`, `.text`,
  `.md`, `.json`.
- `DocumentLoader` MUST поддерживать `workspace://...`, `file://...` и
  локальные пути внутри workspace root.
- Schema-free artifact layer MUST использовать манифесты:
  `documents_manifest`, `chunks_manifest`, `vectors_manifest`,
  `candidates_manifest`, `context_bundle_manifest`.
- `in-flight` и `idempotency` MUST создаваться через atomic filesystem claim
  с stale-policy через `updated_at` и `EXECUTOR_COORDINATION_STALE_MS`.
- `NodeType.config_json` MUST хранить машиночитаемый профиль (role, input/output
  диапазоны, loop-policy, agent limits). Fallback-поведение разрешено только
  в non-production preset (warning, не hard failure).
- Канонический final answer path для strict realistic RAG baseline —
  `LLMAnswer`; `AgentCall` без live ответа от провайдера считается допустимым
  runtime-поведением при условии: execution завершился успешно, `final_result.text`
  присутствует в snapshot, ответ опирается на retrieval context.
- Репозиторий MUST запускаться через `docker-compose up --build` и MUST быть
  открываем по `http://localhost:3000`.

## Процесс Разработки И Контрольные Ворота

Контрольные ворота этой конституции встраиваются в workflow Spec Kit:

- `/speckit.plan` MUST содержать секцию `Constitution Check` и MUST не
  переходить к Phase 0 Research, пока план содержит нерешённые отступления от
  принципов I..VII без явного обоснования в секции `Complexity Tracking`.
- `/speckit.plan` и `/speckit.tasks` MUST перечитывать `Constitution Check`
  после Phase 1 дизайна.
- Каждый новый feature-spec MUST фиксировать, какие из замороженных контрактов
  (`11-backend-contract-freeze.md`) он затрагивает; затрагивание = запрет без
  амендмента конституции.
- Каждая фича, работающая с графом pipeline, MUST декларировать ожидаемый
  стартовый `M'_0` по правилу «объединение рекомендованных подмножеств по
  ролям узлов графа».
- Перед merge в `main` MUST проходить минимальный набор:
  `test:contracts:freeze`, `test:executor:http`, `test:executor:coordination`.
- PR-обзор MUST проверять: отсутствие `tool_ref` / `tool_refs`, наличие
  loop-policy на всех циклах, нормализацию новых метрик в `[0, 1]`, наличие
  trace-артефактов для новых runtime-веток.
- Сложность, не проходящая принципы (например, tool discovery вне
  `ToolNode -> AgentCall`), MUST быть явно обоснована или заменена на
  соответствующий вариант.

## Governance

Данная конституция превосходит любые локальные практики и устные договорённости.

- Амендмент: предложение изменения MUST оформляться как PR, меняющий
  `.specify/memory/constitution.md`. PR MUST содержать Sync Impact Report
  (см. формат в HTML-комментарии сверху файла).
- Версионирование по Semantic Versioning:
  - MAJOR: несовместимое удаление/переопределение принципа или правил governance;
    любое ослабление NON-NEGOTIABLE принципов; разрывное изменение замороженных
    контрактов из `11-backend-contract-freeze.md`.
  - MINOR: добавление нового принципа/раздела или существенное расширение
    нормативного содержания.
  - PATCH: уточнения формулировок, опечатки, рефакторинг текста без изменения
    семантики правил.
- Любой амендмент MUST обновлять: зависимые шаблоны (`plan-template.md`,
  `spec-template.md`, `tasks-template.md`), runtime guidance (`CLAUDE.md`,
  `README.md`, `docs/sdd/*`) и Sync Impact Report.
- Проверка соблюдения: каждый review PR MUST проверять соответствие принципам
  I..VII. Нарушение hard-правил (из H1..H5 и NON-NEGOTIABLE принципа III)
  MUST блокировать merge. Нарушение soft-правил MUST быть зафиксировано в
  `Complexity Tracking` соответствующего плана.
- Отступления от bounded execution (принцип IV) или от каталога метрик
  (принцип V) MUST сопровождаться письменным обоснованием в PR и подписью
  владельца артефакта оценки.
- Данная конституция используется как нормативная база для runtime-guidance
  файлов: `CLAUDE.md`, `.specify/templates/*`, `docs/sdd/*`.

**Version**: 1.0.0 | **Ratified**: 2026-04-23 | **Last Amended**: 2026-04-23
