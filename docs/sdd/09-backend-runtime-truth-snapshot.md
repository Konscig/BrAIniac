# Снимок Текущего Состояния Backend Runtime (2026-04-21)

## Назначение
Документ фиксирует фактическое состояние backend после cleanup legacy-paths и проверки канонического edge-only сценария.

## Что подтверждено
- Живой `strict realistic e2e` проходит на поднятом backend.
- Query-time сценарий `ManualInput -> AgentCall` с отдельными `ToolNode -> AgentCall` capability-edges работает end-to-end.
- `AgentCall` получает callable tools только через входящие рёбра графа.
- `tool_ref` / `tool_refs` как runtime-механика удалены.
- `DocumentLoader`, `Chunker`, `Embedder`, `VectorUpsert`, `HybridRetriever`, `ContextAssembler`, `LLMAnswer`, `CitationFormatter` проходят в одном агентном цикле и фиксируются в `tool_call_trace`.
- `DocumentLoader` читает dataset source через `workspace://...`.
- `HybridRetriever` в strict-сценарии работает через `artifact-vectors`.
- `VectorUpsert` в strict-сценарии работает через `artifact-manifest`.
- `ContextAssembler` отдаёт `context_bundle_manifest`.
- Managed upload path подтверждён живым smoke-тестом.

## Что есть в runtime
- Реализованы handlers для `Trigger`, `ManualInput`, `DatasetInput`, `PromptBuilder`, `Filter`, `Ranker`, `LLMCall`, `AgentCall`, `ToolNode`, `Parser`, `SaveResult`.
- `PromptBuilder` остаётся поддерживаемым runtime-узлом, но считается advanced-only.
- `LLMCall` остаётся отдельной прямой runtime-нодой, но не является каноническим final answer path для strict RAG baseline.
- `ToolNode` поддерживает capability-режим без входов и execution-режим с входами.
- `POST /tool-executor/contracts` больше не маскирует `HttpError` в `200 OK`.
- Oversized manifests и execution snapshots могут externalize'иться в файловый слой `.artifacts`.
- Polling execution умеет читать persisted snapshot, если текущий worker не держит job в памяти.
- `in-flight` и idempotency имеют filesystem-backed baseline.
- `in-flight` и `idempotency` теперь создаются через atomic filesystem claim, а stale-records могут вытесняться по времени жизни.
- idempotency replay подтверждён отдельным HTTP smoke-тестом.

## Что есть для RAG
- Канонический способ рекламы инструментов для агента: upstream `ToolNode -> AgentCall`.
- Backend поддерживает managed dataset upload path через `POST /datasets/upload` с `filename + content_base64`.
- Upload сохраняет source в `backend/.artifacts/datasets/...` и создаёт dataset с `workspace://...` URI.
- `DocumentLoader` поддерживает:
  - `workspace://...`
  - `file://...`
  - локальные пути внутри workspace root
- `DocumentLoader` умеет читать текстовые файлы и `.json` bundles.
- Для schema-free artifact layer используются:
  - `documents_manifest`
  - `chunks_manifest`
  - `vectors_manifest`
  - `candidates_manifest`
  - `context_bundle_manifest`
- Артефакты могут externalize'иться в `external-blob` с `pointer.kind = local-file`.

## Что изменилось на этом этапе
1. Удалена legacy-совместимость по `tool_ref`.
- В runtime остался только путь `ToolNode -> AgentCall`.

2. Разрезан giant shared-файл agent runtime.
- Логика разнесена по отдельным модулям:
  - `node-handler.common`
  - `agent-directive-parser`
  - `agent-tool-discovery`
  - `agent-tool-execution`
  - `agent-output-summary`

3. Добавлен общий toolkit для контрактов инструментов.
- Повторяющиеся примитивы нормализации и распаковки payload вынесены в `tool-contract.input.ts`.

4. Автономный `agent:e2e` больше не держит старую архитектуру.
- Скрипт делегирует каноническому edge-only `rag-agent-e2e`.

5. Contract layer очищен до канонического набора входов.
- Повторяющиеся нормализаторы и payload-unwrapping вынесены в `tool-contract.input.ts`.
- CamelCase и legacy-aliases удалены из канонического RAG contract path.
- Интеграционные payload'ы переведены на канонические snake_case поля.

6. Завершён второй этап cleanup `AgentCall`.
- Provider retry-loop вынесен из `agent-call.node-handler.ts` в `agent-provider-call.ts`.
- Исполнение одной tool-call итерации вынесено в `agent-tool-call-runner.ts`.
- Сборка system prompt/messages вынесена в `agent-prompt-builder.ts`.
- Финальная сборка output вынесена в `agent-call-output.ts`.
- Разрешение одного agent turn вынесено в `agent-turn-resolution.ts`.
- Повторный живой `rag:e2e` подтверждает, что runtime cleanup не сломал edge-only `ToolNode -> AgentCall` сценарий.

7. Завершён этап runtime hardening coordination layer.
- В snapshot store добавлены atomic claim-операции для `in-flight` и `idempotency`.
- Добавлена stale-policy через `updated_at` и `EXECUTOR_COORDINATION_STALE_MS`.
- Добавлен узкий тест `test:executor:coordination` на coordination semantics.
- Добавлен HTTP smoke `test:executor:http` на execution start / idempotency replay / polling.

## Что ещё не доведено
- Upload path пока JSON/base64, а не `multipart/form-data`.
- Retrieval backend остаётся artifact-backed baseline, а не отдельным production-grade vector service.
- В SDD ещё могут оставаться исторические заметки о старом поведении в документах, не относящихся к каноническому runtime snapshot.

## Что зафиксировано перед frontend
- Public backend contracts вынесены в `./11-backend-contract-freeze.md`.
- Frozen baseline теперь включает:
  - `AgentCall.ui_json`
  - `ToolNode.ui_json`
  - `POST /datasets/upload`
  - `POST /pipelines/:id/execute`
  - `GET /pipelines/:id/executions/:executionId`
  - `AgentCall.output`
  - `tool_call_trace`
- Контрактный freeze подтверждается тестом `test:contracts:freeze`.

## Текущая фиксация answer path
- Канонический final answer path для strict realistic сценария: `LLMAnswer`.
- `CitationFormatter` остаётся доступным инструментом, но не считается обязательным шагом baseline.
- `LLMCall` остаётся допустимым runtime-путём, но не считается каноническим strict baseline.

## Текущая пометка по качеству финального ответа
- На текущем backend baseline критерием готовности считается не обязательный live-ответ самого `AgentCall`, а гарантированное завершение agent RAG осмысленным ответом на вопрос.
- Если внешний chat-provider отвечает `429` или иным soft-failure, execution может завершиться через fallback path: `AgentCall` дожимает knowledge path инструментами и берёт финальный answer из `LLMAnswer`.
- Это считается допустимым runtime-поведением и не является критическим блокером, пока:
  - execution завершается успешно;
  - `final_result.text` присутствует в execution snapshot;
  - ответ содержательно опирается на retrieval context, а не деградирует до технического заполнителя.
- Идеальный путь, при котором `AgentCall` сам получает успешный provider response без fallback, остаётся желательным, но на текущем этапе не является обязательным критерием готовности backend.

## Канонические источники в коде
- `backend/src/services/application/node/handlers/agent-call.node-handler.ts`
- `backend/src/services/application/node/handlers/agent-tool-discovery.ts`
- `backend/src/services/application/node/handlers/agent-tool-execution.ts`
- `backend/src/services/application/tool/contracts/tool-contract.input.ts`
- `backend/scripts/rag-agent-e2e-test.mjs`
