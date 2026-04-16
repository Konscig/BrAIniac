# RAG-Инструментарий (MVP -> v2)

## Назначение
Документ фиксирует список инструментов, необходимых для построения RAG-агента в BrAIniac.

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

## Что Обязательно Для Первого RAG-Агента
- DocumentLoader
- Chunker
- Embedder
- VectorUpsert
- QueryBuilder
- HybridRetriever
- ContextAssembler
- LLMAnswer
- CitationFormatter

## Что Добавлять После MVP
- TextNormalizer
- MetadataEnricher
- Reranker
- GroundingChecker
- OutputValidator
- BudgetGuard
- TraceLogger

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

## Циклический RAG-Паттерн (Опционально)
- AgentCall -> HybridRetriever -> LLMAnswer -> GroundingChecker
- при низком качестве возврат на HybridRetriever или QueryBuilder
- обязательное условие: loop.maxIterations >= 1
