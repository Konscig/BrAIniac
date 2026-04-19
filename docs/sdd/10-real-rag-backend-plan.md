# План Развития Backend Для Real RAG Agent (2026-04-19)

## Назначение
Этот документ фиксирует целевую архитектуру первого real RAG agent backend в BrAIniac.

Цель не в том, чтобы сделать «backend только под RAG-продукты».
Цель в том, чтобы сделать «универсальный backend для построения агентов, который умеет поддерживать real RAG agent, не загрязняя core domain model».

## Архитектурные Корректировки
- `AgentCall` не должен получать callable tools из `agent.allowedToolIds`, `agent.allowedToolNames` или `agent.tools`.
- `AgentCall` может оркестрировать инструменты внутри себя, но набор доступных ему tools должен приходить только через рёбра графа.
- Мы не должны вводить RAG-only database entities в core schema сервиса.
- Мы не должны решать задачу RAG persistence через таблицы вроде `DatasetDocument`, `DatasetChunk` или `DatasetVector`.
- Артефакты знаний для RAG должны храниться schema-free способом.

## Целевая Форма
- Ingest/indexing остаётся pipeline.
- Query-time остаётся агентом.
- Доступность tools для агента — только через edges.
- Knowledge artifacts хранятся как JSON artifacts и/или внешние blobs, на которые ссылаются JSON manifests.

```text
Сторона ingest
DatasetInput -> DocumentLoader -> Chunker -> Embedder -> VectorUpsert
                                           |
                                           v
                             artifact manifest / blob storage

Сторона query
ManualInput -> upstream tool-ref/tool-artifact nodes -> AgentCall
                                                   |
                                                   +--> QueryBuilder
                                                   +--> HybridRetriever
                                                   +--> ContextAssembler
                                                   +--> LLMAnswer / LLMCall
                                                   +--> CitationFormatter
                                                   +--> repeat / stop
```

## Непереговорные Ограничения
1. `AgentCall` получает доступ к tools только по edges.
2. Product schema остаётся general-purpose.
3. RAG artifacts должны сначала укладываться в уже существующие generic persistence surfaces.
4. Если артефакты становятся слишком большими для DB JSON полей, они уходят в blob/object storage, а не в новые core RAG tables.

## Канонические Edge-Артефакты Для Tools
Phase 1 стандартизирует явные edge-контракты для инструментов, которые может вызывать агент.

Поддерживаемые базовые формы:
- одиночная ссылка:
```json
{
  "kind": "tool_ref",
  "tool_name": "HybridRetriever",
  "tool_id": 7,
  "desc": "Retrieve top-k candidates"
}
```
- коллекция:
```json
{
  "kind": "tool_refs",
  "tool_refs": [
    { "kind": "tool_ref", "tool_name": "QueryBuilder" },
    { "kind": "tool_ref", "tool_name": "HybridRetriever" }
  ]
}
```

Примечание по совместимости:
- прямые `tool_node` outputs, подключённые рёбрами, остаются допустимыми как явные callable tool artifacts;
- произвольные payloads, в которых просто встречаются поля, похожие на `tool_name`, не должны считаться callable tools.

## Что Значит «Готово»
Первый real RAG agent считается готовым, когда одновременно выполняются все условия:
- `AgentCall` сам выбирает, какие RAG tools вызывать и в каком порядке.
- Набор tools, доступных `AgentCall`, приходит только из upstream graph-connected artifacts.
- `DocumentLoader` загружает реальное содержимое документов из schema-free source, а не только делает synthetic URI normalization.
- `Chunker`, `Embedder`, `VectorUpsert` и `HybridRetriever` работают по persisted artifacts, а не только по inline `input_json`.
- Strict e2e проходит без inline `documents`, `chunks`, `vectors`, `candidates`, `context_bundle` и финального `answer`.
- Execution state безопасен для multi-worker deployment.

## Стратегия Хранения Без Новых Таблиц
Предпочтительный порядок:
1. Хранить маленькие и средние артефакты в существующих JSON-полях, например в node `output_json` и pipeline/report manifests.
2. Для больших артефактов хранить в БД только JSON manifest/pointer, а сам payload класть в blob/object storage.
3. Держать формат максимально generic: тип артефакта, producer node, execution id, pointer, checksums, token counts и metadata.

Рекомендуемая модель артефакта:
- `artifact_kind`: `documents`, `chunks`, `vectors`, `retrieval_candidates`, `context_bundle`
- `owner_scope`: pipeline id, node id, execution id, dataset id, если применимо
- `storage_mode`: `inline-json` или `external-blob`
- `pointer`: `null` для inline artifacts, URL/key/path для внешних артефактов
- `meta`: token counts, model ids, chunking params, timestamps, provenance

Текущий статус реализации:
- inline manifests уже встроены в contract outputs для `documents`, `chunks`, `vectors`, `retrieval_candidates` и `context_bundle`
- downstream contracts уже умеют потреблять эти inline manifests в baseline path
- oversized manifests уже могут externalize'иться в `external-blob` local-file payloads через pipeline artifact store
- consumers manifests уже умеют загружать `external-blob` payloads обратно через `local-file` pointers

## Основные Разрывы
1. Модель доступа к tools ещё не доведена до конца.
- Нужен полностью выверенный edge-based способ рекламировать callable tools для `AgentCall` без hidden agent-config catalog'ов.

2. Persistence знаний ещё не доведён до конца.
- Нужны окончательно выровненные schema-free artifact storage и manifest conventions.

3. Real ingest path ещё не завершён.
- `DocumentLoader` всё ещё требует расширения реальных источников текста, не завязанных на новые DB entities.

4. Real vector path выровнен только частично.
- `VectorUpsert` и `HybridRetriever` уже имеют local artifact-backed baseline, но ещё не имеют production-grade backend boundary.

5. Runtime hardening всё ещё отсутствует.
- Execution state всё ещё process-local.

## Рекомендуемый Порядок Реализации
### Phase 1. Edge-Only Agent Tool Access
- Убрать agent-configured tool catalogs из `AgentCall`.
- Определить edge-level механизм, который рекламирует tools для `AgentCall`.
- Обновить e2e так, чтобы доступность tools доказывалась рёбрами, а не node-local agent config.

Текущий статус реализации:
- `AgentCall` резолвит callable tools из явных edge artifacts `tool_ref` / `tool_refs`.
- `AgentCall` также принимает прямые `tool_node` outputs как явные edge-provided callable tools.

Критерий выхода:
- `AgentCall` может работать только с edge-provided tool refs/artifacts.

### Phase 2. Schema-Free Artifact Layer
- Определить artifact manifests для `documents`, `chunks`, `vectors`, `candidates` и `context`.
- Переиспользовать существующие JSON persistence surfaces, где это возможно.
- Добавить blob/object storage pointers для oversized artifacts.

Текущий статус реализации:
- generic inline manifests уже есть для `documents`, `chunks`, `vectors`, `retrieval_candidates` и `context_bundle`
- executor уже умеет externalize oversized manifests в `.artifacts/.../*.json` и оставлять в runtime state только pointer manifest
- contract consumers уже умеют загружать `external-blob` manifests, когда `pointer.kind = local-file`
- retrieval candidates и context bundles уже получили такую же manifest treatment в contract path

Критерий выхода:
- Backend умеет persist/reload RAG artifacts без новых RAG-specific tables.

### Phase 3. Real DocumentLoader
- Реализовать `DocumentLoader` поверх schema-free storage и/или dataset URI adapters.
- Сделать так, чтобы `DocumentLoader` выдавал manifest плюс реально загруженный document content.

Текущий статус реализации:
- `DocumentLoader` уже поддерживает первый real local-source path:
  - `workspace://...`
  - `file://...`
  - plain local paths, разрешённые внутри настроенного workspace root
- `.json` document bundles и обычные text files уже поддерживаются на этом пути
- неподдержанные URI по-прежнему уходят в synthetic contract behavior

Критерий выхода:
- `DocumentLoader` умеет загружать реальный текст для downstream chunking без inline `documents`.

### Phase 4. Real Artifact-Backed Chunk/Vector Flow
- Сделать так, чтобы `Chunker` читал и писал artifact manifests.
- Сохранить `Embedder` на существующем real embedding path там, где это возможно.
- Сделать так, чтобы `VectorUpsert` сохранял vectors через artifact layer и выбранную vector backend boundary.

Текущий статус реализации:
- `Chunker` и `Embedder` уже читают и пишут manifests на contract path
- `Embedder` теперь протаскивает chunk text/document metadata дальше в vector artifacts
- `VectorUpsert` теперь отдаёт persisted-ready vector manifests с index/namespace metadata
- текущая persistence boundary — это пока local artifact storage, а не dedicated vector backend

Критерий выхода:
- Dataset можно ingest'ить без stuffing всех intermediate artifacts в `input_json`.

### Phase 5. Real Retrieval Path
- Сделать так, чтобы `HybridRetriever` читал из real persisted index или vector backend.
- Возвращать artifact-backed retrieval candidates.

Текущий статус реализации:
- `HybridRetriever` уже умеет ранжировать persisted vector artifacts, пришедшие из manifest/pointer storage
- когда artifact-backed records недоступны, он всё ещё уходит в synthetic retrieval fallback ради совместимости
- dense similarity пока остаётся локальным baseline, а не dedicated retrieval backend

Критерий выхода:
- Retrieval больше не является synthetic.

### Phase 6. Real Answer Path
- Сохранять ответ grounded в retrieved artifacts.
- Выбрать канонический answer path первого real runtime:
  - `AgentCall -> ... -> LLMCall`
  - или `AgentCall -> ... -> LLMAnswer(real executor)`

Критерий выхода:
- Финальные ответы grounded и traceable до retrieved artifacts.

### Phase 7. Runtime Hardening
- Вынести execution state из process-local memory.
- Сделать strict polling безопасным в multi-worker режиме.

Критерий выхода:
- Execution и polling безопасны для реального deployment.

### Phase 8. Real RAG Agent E2E
- Добавить strict e2e profile, который доказывает:
  - edge-only tool access
  - schema-free artifact persistence
  - real retrieval path
  - grounded answer path

Текущий статус реализации:
- realistic RAG e2e script теперь создаёт workspace-backed dataset JSON bundle для `DocumentLoader`
- realistic mode больше не подмешивает inline `documents` в query-time `input_json`
- realistic strict checks теперь утверждают, что:
  - `DocumentLoader` загрузил данные через `document-loader-local-file`
  - `VectorUpsert` использовал `artifact-manifest`
  - `HybridRetriever` использовал `artifact-vectors`
  - `ContextAssembler` отдал `context_bundle_manifest`

Критерий выхода:
- Один strict e2e честно доказывает real RAG agent path end to end.

## Что Не Является Первым Приоритетом
- Новые control nodes, такие как `Branch`, `Merge`, `LoopGate`, `RetryGate`
- RAG-only database entities
- Любой дизайн, который делает `AgentCall` зависимым от hidden node-local tool catalog

## Рабочее Допущение
Да, хранить чанки и похожие артефакты в JSON outputs возможно.

Это приемлемо для:
- прототипов
- маленьких и средних корпусов
- short-lived execution artifacts
- manifests, которые указывают на большие payloads

Это неидеально для:
- больших vector payloads прямо внутри DB JSON
- долгосрочного высоконагруженного хранения без blob offloading
- тяжёлых retrieval workload'ов, которым реально нужна dedicated indexing infrastructure

Поэтому правильное направление такое:
- сначала JSON manifest
- затем blob/object payload, когда это требуется по размеру
- dedicated vector backend только там, где retrieval действительно начинает его требовать
