# Frontend RAG Alignment v1

## Назначение

Документ фиксирует frontend scope для первого этапа актуализации интерфейса под текущий backend runtime.

Источник истины:
- runtime registry backend;
- seed-каталог `NodeType` и `Tool`;
- `11-backend-contract-freeze.md`.

## Узлы, Доступные Во Frontend v1

Во frontend v1 показываются только runtime-реализованные узлы, которые нужны для первого конструктора RAG:

- `Trigger`
- `ManualInput`
- `PromptBuilder`
- `Filter`
- `Ranker`
- `LLMCall`
- `AgentCall`
- `ToolNode`
- `Parser`
- `SaveResult`

## Узлы, Скрытые Во Frontend v1

### Hidden but implemented

- `DatasetInput`

Причина:
- узел реализован в runtime, но не является каноническим способом работы с датасетом в первом RAG UI;
- dataset upload и выбор dataset должны происходить отдельно от графа;
- backend уже умеет передавать dataset в `context.dataset` и использовать его в tool execution без обязательного `DatasetInput`.

### Hidden because not implemented in runtime MVP

- `Branch`
- `Merge`
- `RetryGate`
- `LoopGate`
- `Notify`
- `Export`

Причина:
- эти типы могут присутствовать в seed-каталоге, но не должны предлагаться пользователю, пока не имеют подтвержденного рабочего runtime handler.

## Канонический RAG Flow Для UI

Frontend v1 должен вести пользователя по такому сценарию:

1. Пользователь создает проект и пайплайн.
2. Пользователь загружает dataset отдельным действием через `POST /datasets/upload`.
3. Пользователь собирает граф из:
   - `ManualInput`
   - одного или нескольких `ToolNode`
   - `AgentCall`
   - при необходимости `SaveResult`
4. Пользователь связывает `ToolNode -> AgentCall`.
5. Пользователь запускает pipeline через `POST /pipelines/:id/execute`, передавая `dataset_id` и `input_json`.
6. Frontend делает polling через `GET /pipelines/:id/executions/:executionId`.
7. Frontend показывает итоговый ответ, preflight, summary и execution/debug данные.

## Правила Отображения Инструментов

- Во frontend v1 `ToolNode` показывается как один общий тип узла.
- Конкретный инструмент выбирается в инспекторе узла после размещения на канве.
- Binding инструмента сохраняется через канонический frontend/backend path `ui_json.tool`.
- `ToolNode` без выбранного инструмента считается неполным и должен быть визуально помечен в интерфейсе.

## Правила Отображения Датасета

- Upload датасета не является нодой.
- Dataset panel живет рядом с запуском пайплайна.
- Если у pipeline уже есть dataset, frontend должен предлагать явную замену, а не неявно создавать второй.
- `DatasetInput` остается допустимым backend runtime узлом, но скрыт из v1 product UI.

Текущий статус (2026-04-27):
- Выбор и upload dataset реализованы в run panel, но явный replace-flow для уже привязанного dataset как отдельный UX-шаг пока не выделен.

## Правила Запуска И Debug UI

- Старые frontend режимы `test / hybrid / real` не используются.
- Канонический запуск идет только через:
  - `POST /pipelines/:id/validate-graph`
  - `POST /pipelines/:id/execute`
  - `GET /pipelines/:id/executions/:executionId`
- В `input_json` frontend формирует:
  - `question`
  - `user_query`
- Frontend показывает:
  - execution status
  - validation errors/warnings
  - summary
  - final result
  - node output preview
  - для `AgentCall`: `text`, `final_text_source`, `final_text_origin`, `provider_last_error`, `provider_calls_attempted`, `provider_soft_failures`, `provider_response_id`, `raw_completion_text`, `available_tools`, `tool_calls_executed`, `tool_call_trace`

Текущий статус (2026-04-27):
- Run drawer и per-node trace preview показывают provider/tool diagnostics.
- Отдельная явная маркировка `agent.empty` как диагностического (не пользовательского) финального ответа в UI все еще остается открытым пунктом.

## AgentCall Runtime Decision

- `AgentCall` не должен выполнять fallback-планирование инструментов.
- `ToolNode -> AgentCall` означает capability advertising: инструмент доступен агенту, но не является линейным шагом runtime.
- Инструмент запускается только если LLM явно вернула директиву вида `{"type":"tool_call","tool_name":"...","input":{...}}`.
- Если provider не вернул completion, `AgentCall` не может вызвать инструменты. В этом случае `tool_calls_executed` остается `0`, `tool_call_trace` пустой, а результат должен объяснять provider failure.
- `agent.empty` не является полноценным ответом пользователя. UI должен показывать его как диагностическое состояние, особенно если есть `provider_last_error`.

## Incident 2026-04-24: OpenRouter Free Limit

При ручном smoke-запуске `AgentCall` не дошел до tool calls из-за ошибки provider-а:

- model: `google/gemma-4-26b-a4b-it:free` и `google/gemma-4-31b-it:free`;
- `provider_last_error.code`: `OPENROUTER_UPSTREAM_ERROR`;
- `provider_last_error.status`: `429`;
- direct OpenRouter response: `Rate limit exceeded: free-models-per-day`;
- `X-RateLimit-Limit`: `50`;
- `X-RateLimit-Remaining`: `0`;
- reset: `2026-04-25 05:00:00 +05:00`.

Вывод:

- dataset upload и tool executor не были первопричиной этого запуска;
- LLM не вернула ни final JSON, ни tool_call JSON;
- автономный агент не начал работу, потому что первый provider turn не состоялся;
- frontend/backend должны отличать технически завершенный graph execution от семантически пустого agent result.

Следующие обязательные улучшения:

- Выполнено:
  - backend сохраняет provider error message/details в `AgentCall.output_json.provider_last_error`;
  - frontend показывает provider diagnostics в run drawer (`Agent debug`);
  - capability advertising передает tool descriptions агенту, а не только имена инструментов.
- Частично выполнено:
  - backend smoke для автономного `AgentCall` в strict-режиме уже падает при пустом `provider_response_id` и `provider_soft_failure`, но отдельная явная проверка на `agent.empty` не выделена как самостоятельный assert.
- Остается открытым:
  - UI не должен трактовать `agent.empty` как пользовательский финальный ответ и должен явно показывать это как диагностическое состояние.

Проверка состояния (2026-04-27):
- frontend: `run-panel.tsx`, `canvas-board.tsx`, `custom-nodes.tsx`;
- backend: `agent-call-output.ts`, `tool-node.node-handler.ts`, `agent-tool-discovery.ts`, `rag-agent-e2e-test.mjs`.

### Future Debug Log Panel

- Current MVP debug UI keeps errors in the run drawer and per-node trace preview.
- A dedicated log panel is intentionally out of scope for this phase.
- Future log panel should aggregate execution timeline, node states, raw provider/tool errors, and retry/tool-call events without blocking canvas editing.

## Tool Runtime Update 2026-04-25

- `HybridRetriever` no longer returns synthetic `context passage` candidates. Empty retrieval is represented as `retrieval_source: "no-results"` with `no_results: true`.
- `ContextAssembler` can display/forward empty context bundles from `no-results` without treating that state as a broken tool contract.
- `LLMAnswer` now represents a real model-backed answer capability through OpenRouter. The run drawer should treat provider errors from this tool the same way as other OpenRouter diagnostics.
- Frontend debug views already surface these fields through per-node trace preview and run drawer diagnostics when they are present in node/tool trace payloads.

## Explicit Constructor Semantics 2026-04-25

- Frontend and backend must keep the canvas honest: selected dataset state is user input, not permission for backend to execute hidden ingest/index steps.
- If the user wants RAG preparation, the graph or agent tool calls must explicitly use `DocumentLoader`, `Chunker`, `Embedder`, and `VectorUpsert`.
- `AgentCall` strategy must come from user configuration and advertised tools, not from backend-injected hardcoded prompts.
- Future cache/index UX should be exposed as behavior of a concrete configurable tool, with diagnostics shown in the run drawer, rather than as invisible pre-run pipeline work.
