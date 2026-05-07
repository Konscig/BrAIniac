# RAG-Инструментарий (MVP -> v2)

## Актуализация (2026-04-21)
- Актуальным источником фактического состояния backend-runtime и контрактных инструментов считать `./09-backend-runtime-truth-snapshot.md`.
- Актуальным планом доведения backend до functional real RAG считать `./10-real-rag-backend-plan.md`.
- Этот документ сохраняет расширенный продуктовый roadmap и historical notes.

## Назначение
Документ фиксирует список инструментов, необходимых для построения RAG-агента в BrAIniac.

## Граница Документа (Важно)
- Этот документ описывает инструменты (capabilities), а не ноды графа.
- Ноды исполнения описаны в `./07-mvp-node-catalog.md`.
- Профили ролей нод описаны в `./03-node-role-profiles.md`.
- Executor kind (например, `http-json`, `openrouter-embeddings`) является техническим способом исполнения ToolNode, но не отдельным инструментом каталога.

## Минимальный Контур RAG (MVP)
1. Индексация:
- DocumentLoader -> Chunker -> Embedder -> VectorUpsert

2. Ответ на запрос:
- QueryBuilder -> HybridRetriever -> ContextAssembler -> LLMAnswer -> CitationFormatter

3. Контроль качества:
- GroundingChecker
- TraceLogger

## Каталог Инструментов

### 1) Ingest / Index

**Источники корпуса** (одно из двух, в зависимости от продуктового сценария):

0a. RAG Dataset (рекомендуется для новых пайплайнов; см. feature 002-rag-dataset-tool)
- purpose: подключение корпуса документов к RAG-агенту через управляемое хранилище
- node type: `RAGDataset` (source-узел, без входов графа)
- input: `Node.ui_json.uris[]` — список URI на загруженные файлы
- output: documents[] (формат совпадает с DocumentLoader → drop-in replacement)
- supported formats: `.txt`, `.sql`, `.csv`
- limits: ≤1 МБ на файл, ≤64 файла на узел
- storage prefix: `workspace://backend/.artifacts/rag-corpus/...`

0b. DocumentLoader (legacy путь; сохраняется для обратной совместимости)
- purpose: загрузка документов из Dataset, URI, хранилища
- input: dataset_id или список URI
- output: documents[]
- note: для новых RAG-пайплайнов рекомендуется RAG Dataset, который явно отделяет корпус от golden-датасета (используемого ИИ-Судьёй).

2. TextNormalizer
- purpose: очистка и унификация текста
- input: documents[]
- output: normalized_documents[]

3. Chunker
- purpose: разбиение документов на чанки
- input: normalized_documents[]
- output: chunks[]
- config: strategy, chunk_size, overlap

4. MetadataEnricher
- purpose: обогащение чанков метаданными
- input: chunks[]
- output: chunks_with_metadata[]

5. Embedder
- purpose: построение эмбеддингов
- input: chunks[]
- output: vectors[]
- config: model, batch_size

6. VectorUpsert
- purpose: запись в векторный индекс
- input: vectors[]
- output: upsert_report
- config: index_name, namespace

### 2) Retrieve / Generate
1. QueryBuilder
- purpose: формирование retrieval-запроса
- input: user_query, dialog_context
- output: retrieval_query

2. HybridRetriever
- purpose: поиск top-k кандидатов (dense/sparse/hybrid)
- input: retrieval_query
- output: candidates[]
- config: topK, mode, alpha

3. Reranker
- purpose: переупорядочивание кандидатов
- input: candidates[]
- output: ranked_candidates[]
- config: topN, rerankModel

4. ContextAssembler
- purpose: сборка финального контекста под лимит токенов
- input: ranked_candidates[]
- output: context_bundle
- config: max_context_tokens, strategy

5. LLMAnswer
- purpose: генерация ответа модели по контексту
- input: context_bundle, prompt_template
- output: answer
- config: model, temperature, maxOutputTokens
- note: это инструмент уровня capability, а не нода `LLMCall`.

6. CitationFormatter
- purpose: добавление ссылок на источники
- input: answer, ranked_candidates[]
- output: cited_answer

### 3) Quality / Safety / Ops
1. GroundingChecker
- purpose: проверка опоры ответа на retrieved-контекст
- input: answer, ranked_candidates[]
- output: grounding_report
- config: threshold

2. OutputValidator
- purpose: проверка структуры ответа
- input: answer
- output: validation_report
- config: schema

3. BudgetGuard
- purpose: контроль токенов, времени, стоимости
- input: run_metrics
- output: guard_decision
- config: maxTokens, maxTimeMs, maxCost

4. TraceLogger
- purpose: журналирование шагов для отладки и анализа
- input: step_events
- output: trace_id

## Что Обязательно Для Первого RAG-Агента (Целевой Набор)
- DocumentLoader
- Chunker
- Embedder
- VectorUpsert
- QueryBuilder
- HybridRetriever
- ContextAssembler
- LLMAnswer
- CitationFormatter

## Актуальная Оценка Готовности К Real RAG (2026-04-21)
- Текущий backend уже подтверждает рабочий reference RAG agent runtime на уровне strict e2e.
- Для functional real RAG больше не отсутствует реальный `DocumentLoader` целиком: он умеет читать локальные/managed sources через `workspace://`, `file://` и backend-managed upload path.
- При этом backend всё ещё не равен production-grade RAG platform: embeddings и retrieval живут в artifact-backed baseline, а не во внешнем vector service.
- До завершения плана из `./10-real-rag-backend-plan.md` формулировку "real RAG полностью завершён" всё ещё не использовать. Корректная формулировка: "reference true RAG agent backend подтверждён, production retrieval infrastructure ещё не выделена".

## Статус Реализации (На 2026-04-18)

### MVP RAG
- [x] DocumentLoader
- [x] Chunker
- [x] Embedder
- [x] VectorUpsert
- [x] QueryBuilder
- [x] HybridRetriever
- [x] ContextAssembler
- [x] LLMAnswer (отдельный ToolNode-контракт реализован; также поддерживается путь через `LLMCall`)
- [x] CitationFormatter

Практический вывод по готовности:
- Индексация (DocumentLoader -> Chunker -> Embedder -> VectorUpsert) реализована на уровне рабочего backend baseline:
  - `DocumentLoader` реально читает uploaded/local sources;
  - `Chunker` и `Embedder` работают;
  - `VectorUpsert` сохраняет vectors в artifact-backed storage.
- Retrieval-контур до кандидатов (QueryBuilder -> HybridRetriever) подтверждён в strict e2e, но остаётся artifact-backed baseline, а не external vector DB.
- Контур сборки контекста и пост-обработки цитат (ContextAssembler -> CitationFormatter) реализован.
- Контур контрактов инструментов завершен, включая `LLMAnswer` как ToolNode-capability.
- Генерация ответа через `LLMCall` остаётся поддерживаемым runtime-путём на уровне кода, но не является текущим каноническим strict baseline.
- Для `AgentCall` подтвержден автономный внутренний tool-calling путь, а канонический способ подачи инструментов в актуальном runtime: `ToolNode -> AgentCall`.
- Команды проверки:
  - `npm --prefix backend run test:rag:artifacts`
  - `node backend/scripts/rag-agent-e2e-test.mjs`
  - `node backend/scripts/dataset-upload-smoke-test.mjs`

Known issues (требуют фикса):
- `LLMCall` как отдельная runtime-нода не является текущим подтверждённым strict baseline и всё ещё зависит от устойчивости OpenRouter path.
- Upload path пока реализован как JSON/base64 backend route, а не `multipart/form-data`.

## Аудит Эксплуатационной Готовности Инструментов (На 2026-04-18)

Статусы:
- Contract-ready: контракт и схема вход/выход реализованы и исполняются в ToolNode.
- Integration-ready: подтверждена реальная внешняя интеграция (не только contract-mode).

MVP-инструменты (фактический статус):
- DocumentLoader: Contract-ready, Integration-ready: частично да (локальные и managed uploaded sources подтверждены; cloud/object ingest ещё не реализован).
- Chunker: Contract-ready, Integration-ready: не требуется как локальная трансформация.
- Embedder: Contract-ready; Integration-ready частично (`openrouter-embeddings` path есть, но по умолчанию seed ставит `http-json`).
- VectorUpsert: Contract-ready, Integration-ready: частично да (artifact-backed persisted path подтверждён; внешний vector DB path не реализован).
- QueryBuilder: Contract-ready, Integration-ready: не требуется как локальная трансформация.
- HybridRetriever: Contract-ready, Integration-ready: частично да (artifact-backed retrieval path подтверждён; внешний vector search backend не реализован).
- ContextAssembler: Contract-ready, Integration-ready: не требуется как локальная трансформация.
- LLMAnswer: Contract-ready, Integration-ready: частично да (ToolNode-контракт вызывает OpenRouter chat; качество зависит от provider/key/rate limits).
- CitationFormatter: Contract-ready, Integration-ready: не требуется как локальная трансформация.

Критичные расхождения, влияющие на восприятие "готово":
- По seed-конфигу contract tools по умолчанию используют `http-json` POST на `/tool-executor/contracts`, то есть тест подтверждает contract execution/provenance, но не реальную внешнюю бизнес-интеграцию.
- Для ветки `http-json` большинство контрактов строят `contract_output` детерминированно из нормализованного входа; это корректно для contract-mode, но не эквивалент production-интеграции.
- `test:rag:e2e:realistic` в актуальной канонической форме опирается на dataset/source path и `ToolNode -> AgentCall`, а не на inline knowledge artifacts.
- Production-grade vector infrastructure всё ещё отсутствует: текущий retrieval baseline schema-free и artifact-backed.

### MVP Runtime Ноды (RAG-связанный срез)
- [x] ManualInput
- [x] DatasetInput
- [x] PromptBuilder
- [x] ToolNode
- [x] LLMCall
- [x] AgentCall
- [x] Parser
- [x] Filter
- [x] Ranker
- [x] SaveResult

Ноды из общего каталога, которые пока не готовы в текущем executor MVP:
- [ ] Branch
- [ ] Merge
- [ ] RetryGate
- [ ] LoopGate
- [ ] Notify
- [ ] Export

Примечание:
- Полный статус нод и источник проверки по runtime-dispatcher см. `./07-mvp-node-catalog.md`.

## Что Добавлять После MVP
- [ ] TextNormalizer
- [ ] MetadataEnricher
- [ ] Reranker
- [ ] GroundingChecker
- [ ] OutputValidator
- [ ] BudgetGuard
- [ ] TraceLogger

## Матрица Переиспользуемости

### A. Универсальные Инструменты (для большинства типов агентов)
- TextNormalizer
- Chunker
- OutputValidator
- BudgetGuard
- TraceLogger

### B. Инструменты Работы Со Знаниями (RAG и Knowledge-агенты)
- DocumentLoader
- MetadataEnricher
- Embedder
- VectorUpsert
- QueryBuilder
- HybridRetriever
- Reranker
- ContextAssembler
- CitationFormatter
- GroundingChecker

### C. Задачно-Зависимые Инструменты (обертки)
- LLMAnswer (реально переиспользуем при параметризации prompt-template и модели)
- Доменные загрузчики источников (например CRMLoader, TicketLoader, CodeRepoLoader)

## Карта Соответствий (Инструмент vs Нода)
| что | уровень | где описано | комментарий |
|---|---|---|---|
| LLMAnswer | инструмент | этот документ | capability генерации ответа |
| LLMCall | нода | `./07-mvp-node-catalog.md` | прямой вызов модели как шаг графа |
| AgentCall | нода | `./07-mvp-node-catalog.md` | оркестрация с внутренними вызовами инструментов |
| ToolNode | нода | `./07-mvp-node-catalog.md` | исполнение инструмента как шага графа |

Практическое правило:
- `LLMAnswer` может исполняться через ToolNode или как внутренний tool-call внутри AgentCall.
- `LLMCall` используется, когда нужен прямой шаг вызова модели без инструментальной оркестрации.
- До исправления known issue по устойчивости `LLMCall` рекомендованный путь генерации для e2e-проверок: `AgentCall` с внутренним tool-calling или `LLMAnswer` через ToolNode.
- Исполнение `LLMAnswer` через ToolNode с chat-kind не является обязательной частью MVP-baseline.
- Эти варианты эквивалентны по цели, но различаются по уровню архитектуры и контролю исполнения.

## Канонический Путь Ответа (На 2026-04-20)
- Для текущего strict realistic true RAG agent baseline канонический путь финального ответа: `ContextAssembler -> LLMAnswer`.
- `CitationFormatter` не считается обязательным шагом strict baseline и используется как опциональный post-processing инструмент.
- `LLMCall` не считается каноническим baseline-путём финальной генерации для текущего strict RAG e2e, даже если остаётся допустимым runtime-механизмом.

## Правила Переиспользования (без хардкода одной задачи)
1. Контракт инструмента должен быть schema-first:
- inputSchema
- outputSchema
- version

2. Поведение инструмента задается через config_json, а не через зашитые сценарии.

3. Инструмент должен быть stateless по умолчанию:
- входные данные + конфиг -> детерминированный выход (где возможно)

4. Подключения к внешним системам выносятся в адаптеры/коннекторы.

5. Все пороги качества и лимиты выносятся в параметры:
- threshold
- topK
- max_context_tokens
- maxIterations

6. Наблюдаемость обязательна:
- latency
- token usage
- cost
- trace events

## Какие Инструменты Переиспользуются Для Разных Агентов

### 1) QA RAG-агент
- QueryBuilder -> HybridRetriever -> ContextAssembler -> LLMAnswer -> CitationFormatter

### 2) Агент Поддержки
- QueryBuilder -> HybridRetriever -> LLMAnswer -> OutputValidator -> TraceLogger

### 3) Агент Аналитик Документов
- DocumentLoader -> Chunker -> Embedder -> VectorUpsert -> QueryBuilder -> Reranker -> LLMAnswer

### 4) Агент Извлечения Структуры
- DocumentLoader -> TextNormalizer -> Chunker -> LLMAnswer -> OutputValidator

### 5) Агент-Оценщик (Judge)
- QueryBuilder -> HybridRetriever -> GroundingChecker -> LLMAnswer -> TraceLogger

## Связь С Нодами
- Инструменты могут жить в отдельной ToolNode.
- Инструменты могут вызываться внутри AgentCall как внутренние tool-calls.
- Оба режима поддерживаются одновременно.

## Правило Недублирования На Одном Шаге
- Для одной операции выбирается один путь исполнения: `LLMCall` или `ToolNode(LLMAnswer)` или внутренний вызов внутри `AgentCall`.
- Не рекомендуется дублировать один и тот же смысл одновременно несколькими путями в одной точке графа.

## Циклический RAG-Паттерн (Опционально)
- AgentCall -> HybridRetriever -> LLMAnswer -> GroundingChecker
- при низком качестве возврат на HybridRetriever или QueryBuilder
- обязательное условие: loop.maxIterations >= 1

## Update 2026-04-25: Tool Honesty Fix

- `HybridRetriever` must not synthesize fake passages for runtime answers. If no artifact-backed vector records or candidates are available, it returns `retrieval_source: "no-results"`, `no_results: true`, `candidate_count: 0`, and an empty `candidates` array.
- `ContextAssembler` accepts explicit retriever `no-results` output and produces an empty `context_bundle` instead of failing the run.
- `LLMAnswer` is now a provider-backed answer tool. It calls OpenRouter chat through the existing adapter, requires a user question, uses context when present, and can answer directly when context is absent.
- Artifact-backed storage remains the MVP baseline for `Embedder`, `VectorUpsert`, and `HybridRetriever`; no external vector DB is introduced in this step.

## Update 2026-04-25: Explicit Tool Semantics

- Pipeline execution must not run hidden RAG preparation steps before the graph. The runtime graph and the agent's explicit tool calls are the only execution surface.
- `HybridRetriever` must only retrieve from artifact vectors that are present in explicit predecessor/tool inputs. It must not search arbitrary vectors from `context.input_json` or depend on a hidden `input_json.dataset_index` injected by the pipeline executor.
- Any future reuse/cache behavior belongs inside a concrete tool such as `VectorUpsert` and must preserve that tool's role. A cache hit may skip repeated internal work, but it must not create an invisible graph path.
- `AgentCall` must not receive hardcoded RAG strategy prompts from backend runtime. Strategy belongs to user-authored agent configuration and the tools connected to the agent.
