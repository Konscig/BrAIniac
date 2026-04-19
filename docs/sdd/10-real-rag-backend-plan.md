# План Доведения Backend До Functional Real RAG (2026-04-19)

## Назначение
Этот документ фиксирует практический план доведения текущего backend MVP от `contract-ready orchestration` до functional real RAG backend, пригодного для построения knowledge-backed агента.

Граница документа:
- Только backend-слой.
- Только путь к первому functional RAG-агенту.
- Без детального продуктового scope beyond MVP+.

## Текущая Оценка
- Graph/runtime orchestration: готово на хорошем MVP-уровне.
- Agent runtime (`AgentCall`): частично готово, пригодно для bounded tool-calling.
- Tool contracts: готовы для contract-mode.
- Functional real RAG backend: не готов.

Практическая формулировка:
- Сегодня backend умеет правдоподобно оркестрировать RAG-цепочку.
- Сегодня backend не умеет полноценно обслуживать persistent knowledge base и real retrieval path end-to-end.

## Что Считать "Готово" Для Первого Functional RAG-Агента
Функциональная готовность считается достигнутой, когда одновременно выполняются все условия:
- `DocumentLoader` действительно загружает документы из backend-managed источника, а не только нормализует `dataset_id`/`uri`.
- Документы, чанки и векторные представления живут в постоянном backend-managed storage или в явном внешнем knowledge backend.
- `VectorUpsert` делает реальный upsert в knowledge/vector backend.
- `HybridRetriever` возвращает кандидатов из реального индекса, а не синтетически строит их из текста запроса.
- Генерация ответа использует реальную модель (`LLMCall`, `AgentCall` или real executor для `LLMAnswer`) и строится по retrieved context.
- Strict e2e проходит без подмешивания `documents/chunks/vectors/candidates/context_bundle/answer` в `input_json`.
- Execution state доступен независимо от worker-процесса и не теряется при обычном multi-worker deployment.

## Ключевые Разрывы Текущей Реализации
1. Data plane отсутствует:
- в backend schema нет сущностей документов, чанков и векторов;
- knowledge state не живет в backend как в постоянной системе.

2. Инструменты в основном работают как contract stubs:
- `DocumentLoader`, `VectorUpsert`, `HybridRetriever`, `LLMAnswer` по default path не подтверждают реальную интеграцию.

3. "Realistic" e2e пока проверяет runtime-chain, но не весь knowledge lifecycle:
- промежуточные артефакты не подмешиваются;
- исходные `documents` все еще могут передаваться в `input_json`.

4. Execution state process-local:
- execution snapshots и in-flight bookkeeping живут в памяти процесса;
- это риск для cluster/load-balanced режима.

5. Tool catalog глобально изменяем:
- конфиг tools не изолирован по project/pipeline;
- это мешает безопасному multi-project evolution инструментов.

## Рекомендуемый Порядок Работ
Главный принцип:
- сначала сделать real ToolNode-chain;
- затем строить поверх нее autonomous AgentCall;
- не начинать с Branch/Merge/LoopGate, пока knowledge path не стал реальным.

Почему так:
- пользователю важнее функциональность инструментов и нод knowledge-контура, чем раннее усложнение control-flow;
- без real ingest/retrieve/answer AgentCall будет оркестрировать в основном синтетические инструменты.

## Фаза 0. Truth Alignment И Guardrails
Цель:
- перестать смешивать `contract-ready` и `integration-ready`.

Работы:
- зафиксировать distinction в SDD и README;
- пометить strict сценарии как proof of runtime/provenance, а не proof of full integration;
- в e2e явно разделить `contract`, `realistic-contract`, `real-rag`.

Критерий выхода:
- документы и тестовые профили больше не создают ложное ощущение production-ready RAG.

## Фаза 1. Knowledge Storage Baseline
Цель:
- добавить persistent knowledge layer.

Работы:
- расширить schema сущностями для документов, чанков и векторных записей либо ввести явный storage adapter boundary;
- определить связь `Dataset -> Documents`;
- определить canonical identifiers для `document_id`, `chunk_id`, `vector_id`;
- определить minimal provenance schema для ingest/update.

Критерий выхода:
- backend способен хранить knowledge artifacts без передачи их через `input_json`.

## Фаза 2. Real Ingest Path
Цель:
- сделать реальный ingest-контур.

Работы:
- реализовать real `DocumentLoader`;
- определить поддерживаемые источники первого MVP: `dataset storage`, `memory dataset seed`, `uri fetch adapter` или иной один выбранный baseline;
- сохранить загруженный текст/метаданные в persistent knowledge layer;
- сделать `Chunker` работающим по persisted docs, а не только по inline payload.

Критерий выхода:
- pipeline может стартовать с `dataset_id` и построить chunks без inline `documents`.

## Фаза 3. Real Vector Path
Цель:
- сделать реальный embedding/upsert/retrieve.

Работы:
- оставить `Embedder -> openrouter-embeddings` как реальный baseline path;
- реализовать реальный `VectorUpsert` adapter;
- реализовать реальный `HybridRetriever` adapter поверх knowledge/vector backend;
- определить минимальный retrieval policy: `top_k`, `mode`, `namespace`, `filters`.

Критерий выхода:
- retrieval candidates появляются из persisted index, а не из синтетического contract output.

## Фаза 4. Real Answer Path
Цель:
- сделать реальную grounded answer generation.

Работы:
- выбрать канонический путь первого real answer:
- вариант A: `ContextAssembler -> LLMCall -> CitationFormatter`;
- вариант B: `ContextAssembler -> AgentCall`;
- вариант C: real executor для `LLMAnswer`.
- сохранить связку ответа с retrieved sources;
- гарантировать, что cited answer строится только из реальных retrieved chunk ids.

Критерий выхода:
- ответ получается от реальной модели и имеет проверяемую связь с retrieved context.

## Фаза 5. Runtime Hardening
Цель:
- сделать execution path безопасным для эксплуатации.

Работы:
- вынести execution job state из памяти процесса в persistent/shared storage;
- обеспечить корректный polling в multi-worker режиме;
- выровнять retry/backoff policy для `LLMCall` и `AgentCall`;
- добавить явные execution diagnostics: provenance, attempts, latency, token/cost usage.

Критерий выхода:
- strict execution и polling устойчивы в обычном deployment режиме.

## Фаза 6. Real RAG E2E
Цель:
- получить честный end-to-end proof.

Работы:
- добавить `real-rag` e2e-профиль без inline knowledge artifacts;
- запретить передачу `documents/chunks/vectors/candidates/context_bundle/answer` в strict real-rag сценарии;
- проверять, что knowledge lifecycle прошел через backend-managed storage/integration path.

Критерий выхода:
- strict real-rag e2e проходит на свежем backend-процессе и доказывает functional knowledge path.

## Что Не Является Первым Приоритетом
- `Branch`, `Merge`, `RetryGate`, `LoopGate` не являются blocker для первого functional RAG-agent.
- `GroundingChecker`, `BudgetGuard`, `TraceLogger` важны, но их имеет смысл доводить после появления real retrieval/answer path.
- Расширение универсального tool catalog имеет смысл после стабилизации knowledge baseline.

## Рекомендуемая Первая Реализационная Цель
Рекомендуемый first target:
- real pipeline `DatasetInput -> ToolNode(DocumentLoader) -> ToolNode(Chunker) -> ToolNode(Embedder) -> ToolNode(VectorUpsert) -> ToolNode(QueryBuilder) -> ToolNode(HybridRetriever) -> ToolNode(ContextAssembler) -> AgentCall`.

Почему именно так:
- этот путь минимально меняет текущую архитектуру;
- максимально переиспользует уже существующий runtime;
- позволяет сначала сделать инструменты действительно функциональными, а уже потом расширять agent intelligence.

## Definition Of Done Для Этой Фазы
Фаза считается завершенной, когда:
- backend не требует inline `documents` для ingest;
- backend не требует inline `vectors/candidates/context_bundle` для retrieval/generation;
- хотя бы один strict e2e использует реальный knowledge path end-to-end;
- SDD и runtime truth snapshot подтверждают integration-ready статус для `DocumentLoader`, `Embedder`, `VectorUpsert`, `HybridRetriever` и выбранного answer path.
