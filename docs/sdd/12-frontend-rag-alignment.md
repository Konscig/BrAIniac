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
  - для `AgentCall`: `text`, `final_text_source`, `final_text_origin`, `available_tools`, `tool_calls_executed`, `tool_call_trace`

### Future Debug Log Panel

- Current MVP debug UI keeps errors in the run drawer and per-node trace preview.
- A dedicated log panel is intentionally out of scope for this phase.
- Future log panel should aggregate execution timeline, node states, raw provider/tool errors, and retry/tool-call events without blocking canvas editing.
