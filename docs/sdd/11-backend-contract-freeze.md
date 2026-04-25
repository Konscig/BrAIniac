# Заморозка Backend-Контрактов Перед Frontend (2026-04-22)

## Назначение
Документ фиксирует публичные backend-контракты, на которые может опираться frontend без возврата в backend ради базовых shape-изменений.

Принцип:
- frozen означает, что frontend может считать этот shape источником истины;
- internal означает, что frontend не должен завязываться на это как на продуктовый контракт;
- legacy означает, что shape может ещё существовать в коде, но не считается каноническим для нового UI.

## Граница Public vs Internal

### Public
- `POST /datasets/upload`
- `POST /pipelines/:id/execute`
- `GET /pipelines/:id/executions/:executionId`
- `Node.ui_json` для `AgentCall`
- `Node.ui_json` для `ToolNode`
- advertising output `ToolNode` в capability-режиме
- `AgentCall.output` как execution/debug payload
- `tool_call_trace`

### Internal
- `artifact_manifest` и pointer-поля как storage/runtime-механизм
- конкретные внутренние поля `contract_output` отдельных инструментов, кроме тех, что уже используются backend acceptance-тестами
- snapshot store layout в `.artifacts/runtime/...`
- process-local cache executor-а

### Legacy / Not For Frontend
- `tool_ref` / `tool_refs`
- top-level `ui_json.tool_id` как основной frontend path
- любые input-based механики объявления callable tools вне `ToolNode -> AgentCall`

## Канонический Agent Graph Contract
- Инструменты доступны агенту только через `ToolNode -> AgentCall`.
- `AgentCall` не получает callable tools из `input_json`.
- `ToolNode` без входов работает как capability-node и публикует advertising output:

```json
{
  "kind": "tool_node",
  "tool_name": "DocumentLoader",
  "tool_id": 7,
  "tool_source": "node.tool_id",
  "config_json": {
    "executor": {
      "kind": "http-json",
      "method": "POST",
      "url": "http://localhost:3012/tool-executor/contracts"
    }
  }
}
```

Frontend не должен пытаться синтезировать `tool_ref`-артефакты сам.

## Dataset Semantics For Frontend

- Загрузка датасета в продукте идет через API route `POST /datasets/upload`, а не через ноду графа.
- `DatasetInput` является runtime-узлом чтения датасета из execution context и не создает dataset сам.
- Если при запуске pipeline передан `dataset_id` или у pipeline уже есть dataset, backend прокидывает его в `context.dataset`.
- Tool execution может использовать `context.dataset` напрямую, без обязательного присутствия `DatasetInput` в графе.
- Следствие для frontend v1:
  - upload датасета должен жить в отдельном UI-контуре рядом с запуском;
  - `DatasetInput` не считается каноническим первым способом работы с датасетом для RAG-конструктора.

## Замороженный Contract: `AgentCall.ui_json`

Канонический public shape:

```json
{
  "label": "AgentCall",
  "agent": {
    "modelId": "<env:OPENROUTER_LLM_MODEL>",
    "systemPrompt": "You are AgentCall runtime.",
    "maxToolCalls": 8,
    "maxAttempts": 3,
    "softRetryDelayMs": 1200,
    "temperature": 0.2,
    "maxTokens": 220
  }
}
```

Замороженные поля:
- `label?: string`
- `agent?: object`
- `agent.modelId?: string`
- `agent.systemPrompt?: string`
- `agent.maxToolCalls?: number`
- `agent.maxAttempts?: number`
- `agent.softRetryDelayMs?: number`
- `agent.temperature?: number`
- `agent.maxTokens?: number`

Runtime clamp:
- `AgentCall` accepts `agent.maxToolCalls` in the range `1..20`.

Правило:
- frontend для обычного агентного сценария должен использовать именно `ui_json.agent`.
- `PromptBuilder` не является обязательной частью этого контракта.

## Замороженный Contract: `ToolNode.ui_json`

Канонический public shape:

```json
{
  "label": "ToolNode(DocumentLoader)",
  "tool": {
    "tool_id": 7,
    "name": "DocumentLoader",
    "config_json": {
      "executor": {
        "kind": "http-json",
        "method": "POST",
        "url": "http://localhost:3012/tool-executor/contracts"
      }
    }
  },
  "toolConfig": {
    "top_k": 6
  }
}
```

Замороженные поля:
- `label?: string`
- `tool: object`
- `tool.tool_id?: number`
- `tool.name: string`
- `tool.config_json?: object`
- `toolConfig?: object`

Правило:
- публичный frontend path для binding инструмента — `ui_json.tool`.
- top-level `ui_json.tool_id` не считать каноническим UI-контрактом.

## Замороженный Route Contract: `POST /datasets/upload`

Request body:

```json
{
  "fk_pipeline_id": 123,
  "filename": "notes.txt",
  "mime_type": "text/plain",
  "content_base64": "base64...",
  "desc": "optional"
}
```

Request invariants:
- `fk_pipeline_id` обязателен
- `filename` обязателен
- `content_base64` обязателен
- поддерживаемые форматы v1:
  - `.txt`
  - `.text`
  - `.md`
  - `.json`

Response body:
- обычная dataset-модель backend-а

```json
{
  "dataset_id": 173,
  "fk_pipeline_id": 359,
  "uri": "workspace://backend/.artifacts/datasets/2026-04-22/....txt",
  "desc": "optional"
}
```

Правило:
- frontend опирается на dataset response, а не на внутреннюю структуру artifact storage.

## Замороженный Route Contract: `POST /pipelines/:id/execute`

Headers:
- `Authorization: Bearer ...`
- `x-idempotency-key?: string`

Request body:

```json
{
  "preset": "default",
  "dataset_id": 173,
  "input_json": {
    "question": "What is Artemis II?",
    "user_query": "What is Artemis II?"
  }
}
```

Замороженные правила:
- route принимает только:
  - `preset`
  - `dataset_id`
  - `input_json`
- повтор с тем же `x-idempotency-key` возвращает тот же `execution_id`
- параллельный запуск того же pipeline без idempotent replay не должен порождать второй execution

Response body:

```json
{
  "execution_id": "uuid",
  "pipeline_id": 359,
  "status": "queued",
  "created_at": "2026-04-22T10:00:00.000Z",
  "updated_at": "2026-04-22T10:00:00.000Z",
  "request": {
    "preset": "default",
    "dataset_id": 173,
    "input_json": {
      "question": "What is Artemis II?"
    }
  }
}
```

## Замороженный Route Contract: `GET /pipelines/:id/executions/:executionId`

Response body:

```json
{
  "execution_id": "uuid",
  "pipeline_id": 359,
  "status": "succeeded",
  "created_at": "2026-04-22T10:00:00.000Z",
  "updated_at": "2026-04-22T10:00:04.000Z",
  "started_at": "2026-04-22T10:00:00.200Z",
  "finished_at": "2026-04-22T10:00:04.000Z",
  "idempotency_key": "optional",
  "request": {
    "preset": "default",
    "dataset_id": 173,
    "input_json": {}
  },
  "preflight": {},
  "summary": {},
  "warnings": [],
  "error": null
}
```

Замороженные верхнеуровневые поля:
- `execution_id`
- `pipeline_id`
- `status`
- `created_at`
- `updated_at`
- `started_at?`
- `finished_at?`
- `idempotency_key?`
- `request`
- `preflight?`
- `summary?`
- `warnings?`
- `error?`

## Замороженный Contract: `AgentCall.output`

Канонический frozen shape:

```json
{
  "kind": "agent_call",
  "provider": "openrouter",
  "model": "<env:OPENROUTER_LLM_MODEL>",
  "provider_response_id": "resp-1",
  "text": "done",
  "final_text_source": "directive.final",
  "final_text_origin": "model",
  "raw_completion_text": "{\"type\":\"final\",\"text\":\"done\"}",
  "last_directive": { "kind": "final" },
  "last_directive_kind": "final",
  "last_directive_tool_name": null,
  "usage": { "total_tokens": 10 },
  "provider_usage_complete": true,
  "provider_calls_attempted": 1,
  "provider_soft_failures": 0,
  "provider_last_error": null,
  "attempts_used": 1,
  "llm_turns": 1,
  "max_attempts": 3,
  "max_tool_calls": 8,
  "tool_calls_executed": 0,
  "tool_call_trace": [],
  "provider_soft_failure": false,
  "planner_fallback_used": false,
  "available_tools": [{ "name": "DocumentLoader" }]
}
```

Frozen core fields:
- `kind`
- `provider`
- `model`
- `provider_response_id`
- `text`
- `final_text_source`
- `final_text_origin`
- `raw_completion_text`
- `last_directive`
- `last_directive_kind`
- `last_directive_tool_name`
- `usage`
- `provider_usage_complete`
- `provider_calls_attempted`
- `provider_soft_failures`
- `provider_last_error`
- `attempts_used`
- `llm_turns`
- `max_attempts`
- `max_tool_calls`
- `tool_calls_executed`
- `tool_call_trace`
- `provider_soft_failure`
- `planner_fallback_used`
- `available_tools?`
- `unresolved_tools?`
- `structured_output?`

## Замороженный Contract: `tool_call_trace`

Канонический entry shape:

```json
{
  "index": 1,
  "requested_tool": "DocumentLoader",
  "resolved_tool": "DocumentLoader",
  "source": "model",
  "status": "completed",
  "output": {}
}
```

Допустимые `status`:
- `completed`
- `failed`
- `not_found`

Замороженные поля entry:
- `index`
- `requested_tool`
- `resolved_tool?`
- `source`
- `status`
- `output?`
- `error?`

## Что Frontend Не Должен Считать Замороженным
- конкретные внутренние поля `contract_output` отдельных инструментов, если они не перечислены здесь явно
- filesystem layout `.artifacts/...`
- внутренние поля persisted coordination store
- любые альтернативные ui_json формы, не перечисленные как public canonical shape

## Acceptance Freeze
Перед frontend считаем гарантированным:
1. `ToolNode -> AgentCall` как единственный публичный path для agent tools.
2. `POST /datasets/upload` создаёт dataset с usable `workspace://...` URI.
3. `POST /pipelines/:id/execute` поддерживает idempotent replay.
4. `GET /pipelines/:id/executions/:executionId` пригоден для polling.
5. `AgentCall.output` и `tool_call_trace` пригодны для run/debug UI.

## Проверка Freeze
- `npm --prefix backend run test:contracts:freeze`
- `npm --prefix backend run test:executor:http`
- `npm --prefix backend run test:executor:coordination`

Эти проверки считаются backend baseline для перехода к frontend.
