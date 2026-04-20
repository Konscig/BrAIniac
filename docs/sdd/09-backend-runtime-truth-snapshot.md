# Снимок Текущего Состояния Backend Runtime (2026-04-20)

## Назначение
Документ фиксирует фактическое состояние backend после живого strict-прогона `rag-agent-e2e`.

## Что уже подтверждено
- Живой `strict realistic e2e` проходит на поднятом backend.
- Query-time сценарий `ManualInput -> AgentCall` с отдельными `ToolNode -> AgentCall` capability-edges работает end-to-end.
- `AgentCall` получает callable tools только через входящие рёбра графа.
- `DocumentLoader` читает dataset fixture через `workspace://...`.
- `Chunker`, `Embedder`, `VectorUpsert`, `HybridRetriever`, `ContextAssembler`, `LLMAnswer` проходят в одном агентном цикле и фиксируются в `tool_call_trace`.
- `HybridRetriever` в strict-сценарии действительно работает через `artifact-vectors`.
- `VectorUpsert` в strict-сценарии действительно работает через `artifact-manifest`.
- `ContextAssembler` в strict-сценарии отдаёт `context_bundle_manifest`.

## Что есть в runtime
- В backend реализованы handlers для `Trigger`, `ManualInput`, `DatasetInput`, `PromptBuilder`, `Filter`, `Ranker`, `LLMCall`, `AgentCall`, `ToolNode`, `Parser`, `SaveResult`.
- `ToolNode` поддерживает `http-json` и `openrouter-embeddings`.
- `POST /tool-executor/contracts` больше не скрывает `HttpError` в `200 OK`.
- Oversized manifests и execution snapshots могут уходить в файловый слой `.artifacts`.
- Polling execution умеет читать persisted snapshot, если текущий worker не держит job в памяти.
- Базовые coordination индексы для `in-flight` execution и idempotency теперь тоже имеют filesystem-backed слой.

## Что есть для RAG
- Канонический способ рекламы инструментов для агента: upstream `ToolNode -> AgentCall` capability-edge.
- `tool_ref` и `tool_refs` остаются совместимым backward-compatible путём, но больше не считаются основным target-профилем.
- `DocumentLoader` поддерживает:
  - `workspace://...`
  - `file://...`
  - локальные пути внутри workspace root
- `DocumentLoader` умеет читать текстовые файлы и `.json` bundles.
- Для schema-free artifact layer уже используются:
  - `documents_manifest`
  - `chunks_manifest`
  - `vectors_manifest`
  - `candidates_manifest`
  - `context_bundle_manifest`
- Артефакты могут externalize'иться в `external-blob` с `pointer.kind = local-file`.
- `HybridRetriever` умеет запрещать synthetic fallback по флагу `require_artifact_backed_retrieval`.

## Что было исправлено на этом этапе
1. Исправлен strict realistic e2e.
- Из обязательной strict-последовательности убраны шаги, которые не должны быть жёстко обязательными для true agent path:
  - `QueryBuilder`
  - `CitationFormatter`

2. Исправлен protocol handling для кривого tool-call markup.
- `parseAgentDirective(...)` теперь умеет восстанавливать tool directive даже из нестрого сформированного ответа модели.

3. Добавлена runtime-диагностика `AgentCall`.
- В output теперь есть сведения о происхождении финального текста, последней директиве и сыром completion-тексте.

4. Исправлен prompt surface realistic e2e.
- Для realistic path добавлены нормальные ASCII-инструкции и system prompt без mojibake как канонический рабочий путь.

5. Усилен runtime hardening для multi-worker сценария.
- `startPipelineExecutionForUser(...)` теперь умеет смотреть не только в process-local `Map`, но и в filesystem-backed coordination store:
  - для `in-flight` execution по `pipeline_id`
  - для idempotency по `userId:pipelineId:idempotencyKey`
- Это снижает риск ложного параллельного запуска одного pipeline из разных worker-процессов.

6. Восстановлен целевой edge-only путь для агентных инструментов.
- `ToolNode` без входных данных работает как capability-advertisement нода и не исполняет реальный инструмент до явного agent tool-call.
- `AgentCall` получает такие инструменты через входящие рёбра и не включает advertising-outputs в prompt.

## Что ещё не доведено
- В `rag-agent-e2e-test.mjs` ещё могут оставаться legacy-следы прошлых строк, даже если фактическое выполнение уже идёт по корректным значениям.
- Memory-индексы `inFlightByPipelineId` и idempotency state всё ещё существуют как быстрый локальный cache, но теперь уже не являются единственным источником координации.
- `CitationFormatter` и `QueryBuilder` остаются доступными инструментами, но не считаются обязательными шагами строгого агентного сценария.
- Текущий retrieval backend всё ещё artifact-backed baseline, а не выделенный production-grade vector service.
- В runtime всё ещё остаётся backward-compatible поддержка `tool_ref` / `tool_refs`, хотя целевой профиль уже смещён на `ToolNode -> AgentCall`.

## Вывод
- Backend уже можно считать подтверждённым true RAG agent runtime на уровне strict живого e2e.
- Следующий основной фокус больше не в доказательстве работоспособности пути, а в cleanup, hardening и уточнении канонического answer path.

## Текущая Фиксация Answer Path
- На текущем этапе канонический final answer path для strict realistic сценария это `LLMAnswer`.
- `CitationFormatter` остаётся доступным инструментом, но не считается обязательным шагом strict agent path.
- `LLMCall` остаётся допустимым runtime-путём, но не считается текущим каноническим strict baseline.

## Канонические источники в коде
- `backend/src/services/application/node/handlers/agent-call.node-handler.ts`
- `backend/src/services/application/node/handlers/node-handler.shared.ts`
- `backend/src/services/application/tool/contracts/*.tool.ts`
- `backend/scripts/rag-agent-e2e-test.mjs`
