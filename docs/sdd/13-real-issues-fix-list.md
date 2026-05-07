# Реальные Проблемы К Фиксу (2026-04-27)

Документ собран по фактическому коду frontend/backend + текущим SDD.

Шкала критичности:
- P0: критично (безопасность/прод-эксплуатация/потеря данных)
- P1: высоко (сильно мешает стабильной работе real RAG)
- P2: средне (заметно ухудшает UX/качество, но не полностью блокирует)
- P3: низко (UX/техдолг)

## 1) датасет не загружается на сервер

## 2) Нет рабочего refresh-token flow
- Priority: P1
- Влияние на real RAG: неблокирующее для ядра RAG, но блокирующее для долгих пользовательских сессий
- Статус: подтверждено
- Что не так:
  - access token живет 15 минут;
  - backend auth routes имеют только `signup/login`;
  - frontend хранит поле `refreshToken`, но механизма рефреша токена нет.
- Доказательства:
  - `backend/src/services/core/jwt.service.ts`
  - `backend/src/routes/resources/auth/auth.routes.ts`
  - `frontend/src/providers/AuthProvider.tsx`
  - `frontend/src/lib/api.ts`
- Что фиксить:
  - реализовать refresh-token lifecycle (issue, rotate, revoke, refresh route);
  - добавить silent refresh в API-клиент фронта.

## 3) Embedder по умолчанию идет в deterministic contract-mode, а не в реальный embedding provider
- Priority: P1
- Влияние на real RAG: высокое для качества retrieval; для reference-baseline не блокирует
- Статус: подтверждено
- Что не так:
  - в seed для `Embedder` дефолтный executor — `http-json`;
  - реальный `openrouter-embeddings` есть, но только как optional/recommended;
  - в UI нет явной конфигурации executor kind для ToolNode.
- Доказательства:
  - `backend/prisma/seeds/seed-tool-contracts.mjs`
  - `backend/src/services/application/tool/contracts/embedder.tool.ts`
  - `frontend/src/lib/node-config.ts`
- Что фиксить:
  - сделать явный продуктовый режим provider-backed embeddings;
  - добавить в UI настройку executor kind/model для Embedder;
  - добавить smoke-тест, который проверяет реальный вызов `/embeddings` провайдера.

## 4) лимит по запросам на тулзы увеличить до 100

## 5) ToolNode не показывает описание выбранного инструмента в UI
- Priority: P3
- Влияние на real RAG: неблокирующее
- Статус: подтверждено
- Что не так:
  - карточка ToolNode показывает выбранный label, но не рендерит description выбранного tool;
  - описания инструментов есть в seed/config (`description_ru`) и в capability advertising (`desc`).
- Доказательства:
  - `frontend/src/components/custom-nodes.tsx`
  - `frontend/src/components/canvas-board.tsx`
  - `backend/prisma/seeds/seed-tool-contracts.mjs`
  - `backend/src/services/application/node/handlers/tool-node.node-handler.ts`
- Что фиксить:
  - пробрасывать и отображать description выбранного инструмента в карточке ToolNode/инспекторе.

## 6) Длительное время выполнения до 40 секунд даже при простом запросе

## 7) Лишний placeholder "Инспектор узла появится здесь позже"
- Priority: P3
- Влияние на real RAG: неблокирующее
- Статус: подтверждено
- Доказательство:
  - `frontend/src/components/sidebar-projects.tsx`
- Что фиксить:
  - удалить placeholder-блок или заменить на полезную информацию.

## 8) Ноды Branch/Merge/RetryGate/LoopGate/Notify/Export остаются без runtime handlers
- Priority: P2
- Влияние на real RAG: неблокирующее для текущего v1 конструктора (скрыты), но блокирует расширение сценариев
- Статус: подтверждено
- Что не так:
  - runtime fallback возвращает `kind: not_implemented` для нод вне реестра handlers.
- Доказательства:
  - `backend/src/services/application/node/handlers/node-handler.registry.ts`
  - `docs/sdd/07-mvp-node-catalog.md`
- Что фиксить:
  - либо удалить эти ноды из каталога продукта до реализации;
  - либо реализовать handlers + тесты + включение в UI.


## 10) Legacy-компонент режимов test/hybrid/real остался в коде как техдолг
- Priority: P3
- Влияние на real RAG: неблокирующее
- Статус: подтверждено
- Что не так:
  - компонент с legacy-режимами существует, но в актуальном продукте не должен использоваться.
- Доказательства:
  - `frontend/src/components/environment-mode-switch.tsx`
  - `docs/sdd/12-frontend-rag-alignment.md`
- Что фиксить:
  - удалить legacy-компонент или явно пометить как deprecated + покрыть тестом отсутствие использования.

## 11) Chunker → Embedder теряет ~99% chunks (judge-v2 finding 2026-05-05)
- Priority: P1
- Влияние на real RAG: критическое — retrieval упирается в почти пустой индекс
- Статус: подтверждено через прогон оценки на pipeline `voproshalych-rag-agent` (id=4)
- Симптом:
  - Chunker.contract_output.chunk_count = **512**
  - Embedder.input_items = **3**, embeddings list = **3**
  - VectorUpsert.upserted_count = **3** (из 512 произведённых)
  - HybridRetriever на любом запросе возвращает `candidate_count: 0, retrieval_source: "no-results"`
- Доказательства:
  - `backend/src/services/application/tool/contracts/embedder.tool.ts:50-130` — функции
    `collectChunks`/`pushDistinctChunk`/`normalizeInputChunks` парсят upstream и
    выбрасывают всё кроме первых 3 (предположительно читают только preview из
    artifact-manifest, не следуют по pointer к полному списку);
  - `backend/src/services/application/tool/contracts/tool-artifact.manifest.ts:49-127` —
    `readExternalArtifactItems` работает только при `storage_mode==='external-blob'`,
    а Chunker пишет `storage_mode: 'inline-json'` с большим item_count, но Embedder
    видит manifest, а не сами items.
- Что фиксить:
  - либо Chunker должен класть полный `chunks` массив в payload (если items < 256);
  - либо Embedder должен честно обходить manifest и читать items из артефакта;
  - либо договориться о едином формате передачи между ToolNode-узлами в pipeline.
- Воспроизведение: `node 24` Embedder pipeline=4 после прогона оценки.

## 12) VectorUpsert игнорирует `toolConfig.index_name` и `namespace` override
- Priority: P1
- Влияние на real RAG: критическое — записи летят в дефолтный namespace, retriever
  ищет в кастомном (или наоборот) — индексы расходятся
- Статус: подтверждено
- Симптом:
  - `Node.ui_json.toolConfig` = `{"index_name": "voproshalych-agent", "namespace": ""}`
  - `Node.output_json.data.contract_output` = `{"index_name": "default-index", "namespace": "default", ...}`
- Что фиксить:
  - в `executeResolvedToolBinding`/contract-input протолкнуть `toolConfig` в `contract_input`
    для VectorUpsert (как минимум поля `index_name`, `namespace`);
  - либо в seed/UI задавать config_json самого Tool так, чтобы override применялся.
- Воспроизведение: `Node 25` pipeline=4.

## 13) AgentCall trace не содержал `tool` и `params` (исправлено в judge-v2)
- Priority: P1, **исправлено** commit `1502961`
- Влияние: D-метрики оси Tool-Use в judge возвращали 0 даже на корректных прогонах,
  потому что `agent-tool-call-runner.ts` писал в trace `requested_tool/resolved_tool`,
  но native-метрики искали `tool/params`.
- Что сделано: добавлены явные поля `tool`, `params`, `success` в traceEntry.

## 14) ManualInput.ui_json.question перебивал Trigger.input_json (исправлено в judge-v2)
- Priority: P1, **исправлено** commit `4627117`
- Влияние: при оценке pipeline через golden dataset все items получали один и тот же
  захардкоженный вопрос → batch-оценка была бессмысленной.
- Что сделано: инвертирован приоритет — `Trigger.input_json.question` побеждает
  `ui_json.manualInput.question`. UI-вопрос остаётся fallback'ом для ручного запуска.

## 15) Pipeline.max_time трактовался как мс вместо секунд в operational gate (исправлено в judge-v2)
- Priority: P2, **исправлено** commit `47522f9`
- Влияние: gate всегда failил с `p95 latency 7-10s > 120ms` (потому что `max_time=120`
  это секунды, а в judge'е сравнивалось с миллисекундами).
- Что сделано: конвертация `max_time * 1000` в `T_max_ms`.

## 16) extractAssessOutput читал output_json вместо output_json.data (исправлено в judge-v2)
- Priority: P0, **исправлено** commit `47522f9`
- Влияние: tool_call_trace, structured_output, retrieved_ids никогда не доезжали до judge,
  потому что `persistNodeOutputs` оборачивает реальный output runtime'а в `.data`-поле.

## 17a) Chunker → Embedder теряет 99% chunks: ИСПРАВЛЕНО (judge-v2)
- Priority: P1, **исправлено** commit `<следующий>`
- Корень был в `node-handler.common.ts:collectTextFragments` — `nestedKeys` не
  включал `'contract_output'`, поэтому Chunker.contract_output.chunks никогда
  не доходил до embedding-конвейера. Также `MAX_EMBEDDING_INPUT_ITEMS=24` было
  слишком мало; поднял до 256, лимит массива на нём же.

## 17b) VectorUpsert игнорировал toolConfig.index_name: ИСПРАВЛЕНО (judge-v2)
- Priority: P1, **исправлено** commit `<следующий>`
- `ToolContractDefinition.resolveInput` теперь принимает третьим параметром
  `toolConfig` (mergedToolConfig от ui_json.toolConfig + tool.config_json), и
  `resolveVectorUpsertContractInput` использует его для `index_name`/`namespace`
  с приоритетом UI-override > input_json > defaults.

## 18) В графе voproshalych-rag-agent нет edge VectorUpsert → HybridRetriever
- Priority: P1, **исправлено** через SQL `INSERT INTO Edge (25, 26)` в judge-v2.
- Симптом: HybridRetriever получал inputs.length=0, поэтому
  `collectIndexedVectorRecords` возвращал [] и retriever всегда отвечал
  `candidate_count: 0`.
- Корень: тонология graph в seed создавала `25→27` и `26→27` параллельно,
  без передачи векторов от VectorUpsert к Retriever.
- Долгосрочный фикс: либо seed-скрипт восстанавливать с edge `25→26`, либо
  сделать persistent vector store (см. #19).

## 19) Vector store эфемерный (per-execution artifact path)
- Priority: P2 (архитектурный), статус: задокументирован
- VectorUpsert.contract_output.vectors_manifest.pointer.path =
  `.artifacts/executions/<exec_id>/node-output/...json` — каждый прогон
  пишет в новую папку, т.е. между прогонами индекс «забывается».
- На дипломный демонстрационный кейс сейчас не критично (граф 22→23→24→25→26→27
  выполняется в одном execution и retriever получает свежие векторы по edge),
  но для prod-ready RAG надо настоящий vector DB или общий artifact store.

## 19a) AgentCall в RAG-графе не получает retrieved-context в prompt
- Priority: P1
- Влияние: агент в `voproshalych-rag-agent` отвечает «по своим знаниям LLM»,
  игнорируя 5 кандидатов от HybridRetriever — судья ставит f_judge_ref ~0.25,
  ось C даёт ~0 даже на корректном retrieval'е.
- Симптом:
  - `Node 26 (HybridRetriever).contract_output.candidate_count = 5` ✓
  - `Node 27 (AgentCall).tool_calls_executed = 0`
  - `Node 27.available_tools = null` (отсутствует ключ)
- Корень:
  1) `agent-call.node-handler.ts:17` отфильтровывает все tool_node-shaped
     inputs из prompt через `isToolAdvertisingInput`, поэтому candidates
     никогда не попадают в context.
  2) При попытке зарегистрировать их как tools, `resolveAgentToolBindings`
     требует совпадения с записями в БД `Tool` через `listTools()`.
     VectorUpsert/HybridRetriever как **узлы графа** есть, но в `Tool`-таблице
     может не быть совпадения для этого пользователя или namespace.
  3) System-prompt агента ожидает «фрагменты в тройных кавычках» — то есть
     pre-fetched context, а не tool-using flow.
- Что фиксить (один из вариантов):
  - добавить ContextAssembler-узел между HybridRetriever и AgentCall, который
    превращает `candidates[]` в plain text;
  - либо изменить AgentCall handler так, чтобы для retrieval-toolnode-input
    он сам экстрагировал `candidates[].text` и подмешивал их в promptInputs;
  - либо явно разделить роли: tool-using агент vs context-prefetch агент,
    переключатель в ui_json.

## 20) LLMAnswer-узел в `voproloshalych-rag-linear` (pipeline=3) падает с EMPTY_PROVIDER_RESPONSE
- Priority: P1
- Влияние: pipeline `voproshalych-rag-linear` не отрабатывает ни одного item — оценить
  его невозможно, judge корректно отвечает `JUDGE_PIPELINE_RUNS_ALL_FAILED`.
- Симптом:
  ```
  node 18 (LLMAnswer): EXECUTOR_TOOLNODE_EMPTY_PROVIDER_RESPONSE
    model: deepseek/deepseek-v4-flash-20260423
    contract: LLMAnswer
  ```
- Корневая причина: модель `deepseek-v4-flash-20260423` либо retired, либо отдаёт пустой
  completion на наш промпт (вероятно из-за structure-mode/JSON-схемы).
- Что фиксить:
  - сменить `Node.ui_json.toolConfig.model` на стабильную (тот же `OPENROUTER_LLM_MODEL`,
    что используется в AgentCall — там работает);
  - добавить retry с другой моделью на executor-уровне при EMPTY_PROVIDER_RESPONSE.
- Воспроизведение: `POST /judge/assessments {pipeline_id: 3, dataset_id: 2}`.
