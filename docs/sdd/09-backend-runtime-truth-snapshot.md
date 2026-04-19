# Снимок Текущей Правды Backend Runtime (2026-04-19)

## Назначение
Этот документ фиксирует текущее фактическое состояние backend и заменяет устаревшие предположения.

## Текущая Правда
- В backend runtime реализованы node handlers для:
  - `Trigger`
  - `ManualInput`
  - `DatasetInput`
  - `PromptBuilder`
  - `Filter`
  - `Ranker`
  - `LLMCall`
  - `AgentCall`
  - `ToolNode`
  - `Parser`
  - `SaveResult`
- `ToolNode` сейчас поддерживает `http-json` и `openrouter-embeddings`.
- `ToolNode` требует явный binding инструмента на самой ноде.
- Backend endpoint `POST /tool-executor/contracts` умеет возвращать `contract_output`.
- Локальный synthetic contract output по-прежнему опционален и управляется runtime-config.

## Правда Про AgentCall
- `AgentCall` имеет внутренний bounded loop и умеет оркестрировать tool calls.
- `AgentCall` возвращает execution diagnostics, включая provider info и `tool_call_trace`.
- Доступ `AgentCall` к инструментам должен считаться только edge-derived.
- `AgentCall` не должен зависеть от скрытых node-local catalog'ов инструментов, таких как `allowedToolIds`, `allowedToolNames` или `agent.tools`.
- Канонический edge-контракт для callable tools — это явные артефакты `tool_ref` / `tool_refs`.
- Прямые `tool_node` outputs, подключённые рёбрами, по-прежнему допустимы как явные callable tool artifacts.

## Правда Про RAG
- `DocumentLoader` всё ещё в основном находится в состоянии contract-ready, но уже имеет первый реальный local-source path.
- `DocumentLoader` уже умеет загружать локальные text и JSON bundle источники из:
  - `workspace://...`
  - `file://...`
  - plain local paths внутри настроенного workspace root
- Неподдержанные URI по-прежнему уходят в synthetic contract fallback.
- `VectorUpsert` теперь пишет artifact-backed vector payloads с chunk/document metadata в manifest-friendly outputs.
- `HybridRetriever` теперь умеет ранжировать persisted vector artifacts, если в них есть chunk text/metadata.
- `HybridRetriever` по-прежнему сохраняет synthetic fallback path, если retrievable artifact-backed records недоступны.
- Realistic RAG e2e path теперь использует workspace-backed dataset JSON bundle вместо inline `documents` в query-time input.
- `LLMAnswer` в ToolNode contract mode по default path всё ещё детерминированный.
- Утверждать, что strict real RAG уже готов, пока нельзя.

## Правда Про Storage
- Backend не должен вводить RAG-specific core DB entities для документов, чанков и векторов.
- Предпочтительное направление — schema-free artifact storage:
  - сначала существующие JSON outputs/manifests
  - затем blob/object storage pointers
  - dedicated vector backend только там, где retrieval реально этого требует
- Contract outputs уже отдают inline manifests для базового artifact flow:
  - `documents_manifest`
  - `chunks_manifest`
  - `vectors_manifest`
- Downstream contracts теперь также умеют отдавать и принимать:
  - `retrieval_candidates` manifests
  - `context_bundle` manifests
- Oversized manifests теперь могут externalize'иться в `external-blob` payloads с `pointer.kind = local-file`.
- Consumers manifests уже умеют читать такие local-file `external-blob` payloads обратно.

## Что Всё Ещё Не Готово Для Реального RAG Agent
- Edge-based tool advertising частично продуктализирован через явные `tool_ref` / `tool_refs`, но всё ещё требует более строгой валидации и более широкого внедрения в runtime.
- Реальная загрузка документов реализована только частично.
- Vector persistence и retrieval уже имеют локальный artifact-backed baseline, но ещё не имеют production-grade dedicated backend.
- Realistic e2e path стал ближе к реальному artifact-backed flow, но полноценный strict end-to-end proof всё ещё зависит от живого backend и стабильности provider path.
- Execution state всё ещё process-local, что рискованно для multi-worker deployment.

## Устаревшие Предположения
- «AgentCall может получать tools из node-local agent config» — устарело.
- «RAG persistence нужно решать через новые RAG-таблицы в основной схеме» — устарело.
- «Успешный contract-mode flow доказывает готовый real RAG backend» — неверно.

## Канонические Источники В Коде
- Runtime registry:
  - `backend/src/services/application/node/handlers/node-handler.registry.ts`
- Runtime handlers:
  - `backend/src/services/application/node/handlers/*.node-handler.ts`
- Общая runtime-логика нод:
  - `backend/src/services/application/node/handlers/node-handler.shared.ts`
- Реестр tool contracts:
  - `backend/src/services/application/tool/contracts/index.ts`
- Логика tool contracts:
  - `backend/src/services/application/tool/contracts/*.tool.ts`
