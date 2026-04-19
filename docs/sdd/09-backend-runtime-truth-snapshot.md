# Backend Runtime Truth Snapshot (2026-04-19)

## Назначение
Этот документ фиксирует актуальное состояние backend-runtime и заменяет спорные трактовки из исторических заметок.

Граница документа:
- Только фактически реализованное поведение runtime-нод и инструментов-контрактов.
- Только текущая ветка `tools-for-agents`.
- Только backend-слой исполнения графа.

## Что правда сейчас
- Реестр runtime-обработчиков нод содержит 11 реализованных типов: `Trigger`, `ManualInput`, `DatasetInput`, `PromptBuilder`, `Filter`, `Ranker`, `LLMCall`, `AgentCall`, `ToolNode`, `Parser`, `SaveResult`.
- `ToolNode` поддерживает только `http-json` и `openrouter-embeddings`.
- `ToolNode` требует явный binding инструмента (`ui_json.tool` или `ui_json.tool_id`), implicit fallback отсутствует.
- Контрактный endpoint backend `POST /tool-executor/contracts` возвращает provenance-поля `executor=backend-contract-http-json`, `contract_output_source` и `contract_output` (при успешной сборке).
- По умолчанию локальный synthetic `contract_output` выключен (`EXECUTOR_ALLOW_LOCAL_CONTRACT_OUTPUT=0`), и используется только как debug opt-in.
- В `AgentCall` работает edge-driven binding инструментов: входные tool-артефакты из ребер (`agent.inputs`) объединяются с объявленными `agent.tools`.
- `AgentCall` возвращает расширенную provider-диагностику: `provider_response_id`, `provider_usage_complete`, `provider_calls_attempted`, `provider_soft_failures`, `provider_last_error`, `tool_call_trace`.
- `seed-tool-contracts` по умолчанию настраивает `http-json` executor как `POST .../tool-executor/contracts`, а не `GET .../health`.

## Что ложь или устарело
- Утверждение, что `test:agent:e2e` проходит только в forced `/health`-режиме: устарело.
- Утверждение, что строгие прогоны обязательно допускают `provider_soft_failure`: ложь для strict-политики.
- Утверждение, что default executor контрактов это `GET /health`: устарело.
- Утверждение, что `AgentCall` разрешает инструменты только из `agent.tools`: устарело.

## Реализованные runtime-ноды

### 1) Trigger
- Поведение: формирует событие старта.
- Output: `kind=trigger`, `triggered_at`, `input`.
- Ошибки: нет доменных проверок.

### 2) ManualInput
- Поведение: прокидывает пользовательский payload запуска.
- Output: `kind=manual_input`, `value=context.input_json`.
- Ошибки: нет доменных проверок.

### 3) DatasetInput
- Поведение: отдает dataset из execution context.
- Output: `kind=dataset_input` + поля dataset.
- Ошибка: `EXECUTOR_DATASET_REQUIRED`, если dataset не передан.

### 4) PromptBuilder
- Поведение: собирает prompt из входных артефактов и `input_json`.
- Output: `kind=prompt`, `prompt`, `part_count`.

### 5) Filter
- Поведение: фильтрация candidate-списка по правилу `field/op/value`.
- Поддержка: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `not_in`.
- Конфиг: `filter.field`, `filter.op`, `filter.value`, `filter.limit`.
- Output: `total_items`, `kept_items`, `dropped_items`, `rule`, `items`.
- Ошибка: `EXECUTOR_FILTER_CONFIG_INVALID` при неполном/неконсистентном правиле.

### 6) Ranker
- Поведение: ранжирует candidates по числовому score и текстовому overlap.
- Конфиг: `ranker.scoreField` (default `score`), `ranker.textField` (default `text`), `ranker.order` (`desc` default), `ranker.topK`, `ranker.query`.
- Output: `items` + `ranking` c rank/score/source_index.

### 7) LLMCall
- Поведение: прямой вызов chat completion через OpenRouter adapter.
- Конфиг: `llm.modelId`, `llm.temperature`, `llm.maxTokens`.
- Output: `kind=llm_response`, `provider=openrouter`, `model`, `text`, `usage`.
- Операционный риск: чувствителен к upstream availability/rate-limit провайдера.

### 8) AgentCall
- Поведение: bounded агентный runtime с внутренним loop и tool-calling.
- Особенности:
  - protocol `tool_call` / `final` в LLM-диалоге;
  - fallback planner при отсутствии корректной директивы модели;
  - internal execution trace для каждого tool-вызова.
- Конфиг: `agent.maxToolCalls`, `agent.maxAttempts`, `agent.softRetryDelayMs`, `agent.modelId`, `agent.temperature`, `agent.maxTokens`.
- Output: `text`, `structured_output` (если JSON), `tool_call_trace`, provider evidence/diagnostics.

### 9) ToolNode
- Поведение: исполняет один инструмент через контракт и executor.
- Требования:
  - обязательный binding инструмента;
  - обязательный executor kind;
  - проверка совместимости контракта с executor kind.
- `http-json` path:
  - отправляет payload в executor endpoint;
  - при успехе читает `response.contract_output` как основной provenance source.
- `openrouter-embeddings` path:
  - строит embeddings через OpenRouter;
  - контрактный output может быть собран локально только при debug opt-in.

### 10) Parser
- Поведение: берет первый вход (или `input_json`), приводит к тексту и пытается распарсить JSON.
- Output: `raw_text`, `parsed_json`, `parse_ok`.

### 11) SaveResult
- Поведение: формирует lightweight summary сохранения результата.
- Output: `saved_at`, `received_inputs`, `preview`.

## Ноды каталога, но не реализованные в runtime-dispatch
- `Branch`
- `Merge`
- `RetryGate`
- `LoopGate`
- `Notify`
- `Export`

Runtime для них: `kind=not_implemented`.

## Реализованные инструменты (контракты)

### 1) DocumentLoader
- Allowed executors: `http-json`.
- Input contract: `dataset_id` или непустые `uris`.
- Output contract: `dataset_id`, `document_count`, `documents[]`.

### 2) QueryBuilder
- Allowed executors: `http-json`.
- Input contract: непустой `user_query`.
- Output contract: `normalized_query`, `query_mode=keyword`, `keywords[]`.

### 3) Chunker
- Allowed executors: `http-json`.
- Input contract: непустые `documents`.
- Output contract: `strategy=word-window`, `chunk_size`, `overlap`, `chunks[]`.

### 4) Embedder
- Allowed executors: `http-json`, `openrouter-embeddings`.
- Input contract: непустые `chunks`.
- Output contract:
  - `http-json`: deterministic vectors;
  - `openrouter-embeddings`: provider vectors + model metadata.

### 5) VectorUpsert
- Allowed executors: `http-json`.
- Input contract: непустые `vectors`.
- Output contract: `upserted_count`, `vector_size`, `upsert_ids`, `status=upserted`.

### 6) HybridRetriever
- Allowed executors: `http-json`.
- Input contract: непустой `retrieval_query`.
- Output contract: `candidates[]`, `candidate_count`, `mode`, `alpha`, `top_k`.

### 7) ContextAssembler
- Allowed executors: `http-json`.
- Input contract: непустые `candidates`.
- Output contract: `context_bundle` с token-budget ограничением, `selected_count`, `truncated`.

### 8) LLMAnswer
- Allowed executors: `http-json`.
- Input contract: непустой контекст (`context_bundle`/`context_text`).
- Output contract: deterministic grounded answer + prompt/model/token metrics.

### 9) CitationFormatter
- Allowed executors: `http-json`.
- Input contract: непустой `answer`.
- Output contract: `citations[]`, `citation_count`, `cited_answer`.

## Важный операционный инвариант для strict-прогонов
- Падение strict-проверок на `localhost:3000` может быть ложным сигналом, если работает старый backend-процесс без свежих изменений.
- Перед strict RAG/Agent прогоном проверять `POST /tool-executor/contracts`: в ответе должны быть `contract_output_source` и `contract_output`.

## Источники истины в коде
- Реестр runtime-нод: `backend/src/services/application/node/handlers/node-handler.registry.ts`
- Runtime-обработчики нод: `backend/src/services/application/node/handlers/*.node-handler.ts`
- Shared runtime логика нод: `backend/src/services/application/node/handlers/node-handler.shared.ts`
- Реестр инструментов-контрактов: `backend/src/services/application/tool/contracts/index.ts`
- Контрактная логика инструментов: `backend/src/services/application/tool/contracts/*.tool.ts`
- Seed профилей нод: `backend/prisma/seeds/seed-basic-node-types.mjs`
- Seed конфигураций инструментов: `backend/prisma/seeds/seed-tool-contracts.mjs`
