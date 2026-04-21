# План Развития Backend Для True RAG Agent (2026-04-21)

## Назначение
Документ фиксирует целевую архитектуру и следующий порядок работ после упрощения backend под каноническую модель агента.

## Непереговорные ограничения
1. `AgentCall` получает callable tools только по рёбрам графа.
2. `AgentCall` не использует hidden node-local tool catalog.
3. Мы не добавляем RAG-specific core DB сущности в product schema.
4. RAG-артефакты хранятся schema-free через manifests и pointers.
5. Большие payloads уходят во внешний blob/file слой.

## Что уже достигнуто
- Edge-only tool access для `AgentCall` реализован.
- Канонический capability-путь `ToolNode -> AgentCall` подтверждён живым e2e.
- Legacy-path по `tool_ref` удалён из backend runtime.
- Giant shared-файл agent runtime разрезан на узкие модули.
- Общий toolkit нормализации для tool contracts добавлен.
- Schema-free artifact layer реализован.
- `DocumentLoader` читает локальные и managed sources.
- Backend-managed dataset upload path реализован без изменения product schema.
- Artifact-backed baseline для `VectorUpsert` и `HybridRetriever` реализован.
- `AgentCall` проходит strict realistic e2e на живом backend.
- Execution coordination больше не полностью process-local.

## Текущий канонический профиль
- Граф для query-time сценария: `ManualInput + ToolNode -> AgentCall`.
- Канонический ingest/runtime acceptance path:
  - `DocumentLoader`
  - `Chunker`
  - `Embedder`
  - `VectorUpsert`
  - `HybridRetriever`
  - `ContextAssembler`
  - `LLMAnswer`
- `CitationFormatter` допустим как дополнительный post-processing шаг.
- `PromptBuilder` остаётся advanced-only и не входит в канонический агентный путь.
- `LLMCall` остаётся отдельной прямой runtime-нодой вне канонического strict RAG baseline.

## Следующие приоритеты

### Фаза 1. Cleanup Contract Layer
Цель:
- закончить сокращение случайной сложности в инструментальных контрактах.

Задачи:
- довести перевод контрактов на общий toolkit до конца;
- убрать мусорные legacy-aliases, которые не нужны текущему продукту;
- удалить битые комментарии и привести contract layer к одному стилю;
- сохранить только реально используемые alias-формы входов.

Статус:
- завершена

Результат:
- повторяющиеся нормализаторы и payload-unwrapping вынесены в `tool-contract.input.ts`;
- camelCase и legacy-aliases удалены из канонического RAG contract path;
- интеграционные payload'ы переведены на канонические snake_case поля.

Критерий выхода:
- контракты не копируют одинаковые нормализаторы и payload-unwrapping;
- входные формы контрактов описывают текущий продукт, а не историю миграций.

### Фаза 2. Cleanup AgentCall Runtime
Цель:
- упростить внутреннюю структуру `AgentCall` без изменения публичного поведения.

Задачи:
- при необходимости ещё сильнее развести provider loop, directive parsing, tool execution и finalization;
- локализовать fallback/recovery-код для malformed tool-call markup;
- удержать `tool_call_trace`, `final_text_source`, `raw_completion_text` как стабильный execution/debug contract.

Критерий выхода:
- `AgentCall` читается линейно и не тащит в себя лишнюю glue-логику.

### Фаза 3. Runtime Hardening
Цель:
- довести execution lifecycle до более строгого multi-worker safe поведения.

Задачи:
- проверить race-safety filesystem-backed `in-flight` и idempotency baseline;
- формализовать cleanup policy для stale coordination records;
- убедиться, что polling и старт execution не завязаны на process-local cache как на единственный источник истины.

Критерий выхода:
- execution и polling безопасны для multi-worker deployment на текущем backend baseline.

### Фаза 4. Retrieval Boundary Hardening
Цель:
- чётко отделить доказанный artifact-backed baseline от будущего production retrieval backend.

Задачи:
- описать, где заканчивается текущий baseline и где начинается будущая infra-эволюция;
- не смешивать runtime readiness и масштабирование retrieval infrastructure;
- при необходимости подготовить интерфейсную границу под внешний vector backend, не ломая текущий artifact path.

Критерий выхода:
- roadmap явно разделяет текущую рабочую платформу и будущий infra-scale path.

## Ближайший исполнимый порядок
1. Дочистить contract layer вокруг `DocumentLoader`, `Chunker`, `Embedder`, `VectorUpsert`, `HybridRetriever`, `ContextAssembler`, `LLMAnswer`.
2. Зафиксировать и удержать текущий execution/debug contract `AgentCall`.
3. Проверить runtime hardening на race/idempotency сценариях.
4. После этого переходить к boundary между artifact-backed retrieval и внешним retrieval backend.

## Канонический final answer path
Для текущего true RAG agent backend канонический final answer path фиксируется так:

1. Основной финальный шаг: `LLMAnswer`.
2. `LLMAnswer` считается основным способом получения grounded-ответа в strict realistic agent path.
3. `CitationFormatter` не считается обязательным шагом baseline.
4. `CitationFormatter` рассматривается как опциональный post-processing.
5. `LLMCall` не считается каноническим final answer path для текущего strict RAG baseline.

Практическое правило:
- если нужен доказанный strict baseline, считать целевым путь `DocumentLoader -> Chunker -> Embedder -> VectorUpsert -> HybridRetriever -> ContextAssembler -> LLMAnswer`;
- если нужна дополнительная полировка ответа, после `LLMAnswer` может добавляться `CitationFormatter`;
- если используется `LLMCall`, это альтернативный runtime-путь, а не baseline-профиль.
