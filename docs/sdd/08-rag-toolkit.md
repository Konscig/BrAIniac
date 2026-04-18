# RAG-Инструментарий (MVP -> v2)

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
1. DocumentLoader
- purpose: загрузка документов из Dataset, URI, хранилища
- input: dataset_id или список URI
- output: documents[]

2. TextNormalizer
- purpose: очистка и унификация текста
- input: documents[]
- output: normalized_documents[]

3. Chunker
- purpose: разбиение документов на чанки
- input: normalized_documents[]
- output: chunks[]
- config: strategy, chunkSize, overlap

4. MetadataEnricher
- purpose: обогащение чанков метаданными
- input: chunks[]
- output: chunks_with_metadata[]

5. Embedder
- purpose: построение эмбеддингов
- input: chunks[]
- output: vectors[]
- config: model, batchSize

6. VectorUpsert
- purpose: запись в векторный индекс
- input: vectors[]
- output: upsert_report
- config: indexName, namespace

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
- config: maxContextTokens, strategy

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
- Индексация (DocumentLoader -> Chunker -> Embedder -> VectorUpsert) реализована.
- Retrieval-контур до кандидатов (QueryBuilder -> HybridRetriever) реализован.
- Контур сборки контекста и пост-обработки цитат (ContextAssembler -> CitationFormatter) реализован.
- Контур контрактов инструментов завершен (contract-mode), включая `LLMAnswer` как ToolNode-контракт.
- Генерация ответа через `LLMCall` остается поддерживаемым runtime-путем на уровне кода, но эксплуатационно нестабильна в e2e из-за OpenRouter upstream/rate-limit ошибок (`OPENROUTER_UPSTREAM_ERROR`).
- Для AgentCall подтвержден автономный внутренний tool-calling путь (без отдельной цепочки ToolNode в графе) через e2e сценарий `ManualInput -> AgentCall`.
- Команда проверки: `npm --prefix backend run test:agent:e2e`.

Known issue (требует фикса):
- `LLMCall` в изолированном и realistic e2e может завершаться `failed` из-за upstream-ошибок провайдера (`OPENROUTER_UPSTREAM_ERROR`, status 429/503).
- Нужен отдельный фикс устойчивости: retry/backoff в runtime-обработчике `LLMCall` и выравнивание soft-failure политики в e2e.

## Аудит Эксплуатационной Готовности Инструментов (На 2026-04-18)

Статусы:
- Contract-ready: контракт и схема вход/выход реализованы и исполняются в ToolNode.
- Integration-ready: подтверждена реальная внешняя интеграция (не только contract-mode).

MVP-инструменты (фактический статус):
- DocumentLoader: Contract-ready, Integration-ready: нет (по умолчанию deterministic contract output).
- Chunker: Contract-ready, Integration-ready: не требуется как локальная трансформация.
- Embedder: Contract-ready; Integration-ready частично (`openrouter-embeddings` path есть, но по умолчанию seed ставит `http-json`).
- VectorUpsert: Contract-ready, Integration-ready: нет (реальный upsert во внешний векторный backend не подтвержден по default path).
- QueryBuilder: Contract-ready, Integration-ready: не требуется как локальная трансформация.
- HybridRetriever: Contract-ready, Integration-ready: нет (default path формирует детерминированных кандидатов по контрактной логике).
- ContextAssembler: Contract-ready, Integration-ready: не требуется как локальная трансформация.
- LLMAnswer: Contract-ready, Integration-ready: нет (в ToolNode-контракте используется deterministic answer path).
- CitationFormatter: Contract-ready, Integration-ready: не требуется как локальная трансформация.

Критичные расхождения, влияющие на восприятие "готово":
- По seed-конфигу contract tools используют `http-json` GET на `/health` как default executor, то есть тест может подтвердить orchestration, но не реальную внешнюю бизнес-интеграцию.
- Для ветки `http-json` большинство контрактов строят `contract_output` детерминированно из нормализованного входа; это корректно для contract-mode, но не эквивалент production-интеграции.
- `test:rag:e2e` и `test:rag:e2e:realistic` могут завершаться `SUCCESS` при soft OpenRouter failure в non-strict режиме.

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
- maxContextTokens
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
