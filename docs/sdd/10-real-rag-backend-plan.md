# План Развития Backend Для True RAG Agent (2026-04-20)

## Назначение
Документ фиксирует целевую архитектуру и следующий порядок работ после того, как strict realistic e2e уже прошёл на живом backend.

## Непереговорные ограничения
1. `AgentCall` получает callable tools только по рёбрам графа.
2. `AgentCall` не использует hidden node-local tool catalog.
3. Мы не добавляем RAG-specific core DB сущности в product schema.
4. RAG-артефакты хранятся schema-free способом через manifests и pointers.
5. Большие payloads уходят во внешний blob/file слой, а не в новые core-таблицы.

## Что уже достигнуто
- Edge-only tool access для `AgentCall` реализован.
- Schema-free artifact layer реализован.
- `DocumentLoader` читает локальные реальные источники.
- Artifact-backed baseline для `VectorUpsert` и `HybridRetriever` реализован.
- `AgentCall` проходит strict realistic e2e на живом backend.
- Execution coordination больше не полностью process-local: polling, `in-flight` и idempotency уже имеют filesystem-backed baseline.

## Что теперь является следующим приоритетом

### Фаза 1. Cleanup E2E И Prompt Surface
Цель:
- убрать legacy-мусор и сделать e2e-скрипт чистым и однозначным.

Задачи:
- удалить оставшиеся битые legacy-строки и дубли ключей из `rag-agent-e2e-test.mjs`;
- оставить один канонический realistic prompt path;
- синхронизировать strict assertions с истинной агентной моделью.

Критерий выхода:
- e2e-скрипт не содержит дублирующихся `instruction`/`systemPrompt` и не содержит mojibake.

### Фаза 2. Cleanup AgentCall Runtime
Цель:
- привести runtime к чистой канонической модели после успешной стабилизации.

Задачи:
- проверить, какие диагностические поля оставить как постоянные, а какие были временными;
- решить, нужно ли сохранять lenient recovery для malformed tool-call markup как постоянную норму;
- при необходимости оформить recovery-path как явную policy, а не как неявный обход.

Критерий выхода:
- `AgentCall` остаётся устойчивым, но без лишнего временного мусора.

### Фаза 3. Канонический Answer Path
Цель:
- определить и зафиксировать рекомендованный финальный answer path.

Задачи:
- решить, что считать основным финальным шагом:
  - `LLMAnswer`
  - `LLMCall`
  - опциональный `CitationFormatter`
- зафиксировать, когда `CitationFormatter` обязателен, а когда нет;
- зафиксировать ожидания к grounded final output.

Критерий выхода:
- в SDD есть однозначный canonical answer path для true RAG agent.

### Фаза 4. Runtime Hardening
Цель:
- убрать остаточную process-local координацию.

Задачи:
- вынести `inFlightByPipelineId`;
- вынести idempotency state;
- довести execution lifecycle до multi-worker safe поведения.

Критерий выхода:
- execution и polling безопасны для multi-worker deployment.

Текущий статус:
- execution snapshots уже persisted в shared filesystem store;
- `in-flight` coordination уже имеет filesystem-backed baseline по `pipeline_id`;
- idempotency уже имеет filesystem-backed baseline по `userId:pipelineId:idempotencyKey`;
- следующим шагом runtime hardening остаётся не базовая координация, а доведение этой схемы до более строгой модели race-safety и cleanup policy.

### Фаза 5. Retrieval Boundary Hardening
Цель:
- определить, где заканчивается artifact-backed baseline и начинается production retrieval backend.

Задачи:
- зафиксировать порог, после которого нужен выделенный vector backend;
- описать boundary между contract/artifact baseline и production retrieval path;
- не смешивать доказанный RAG runtime и будущую infra-эволюцию.

Критерий выхода:
- roadmap разделяет runtime readiness и infra scaling.

## Ближайший исполнимый план
1. Дочистить `backend/scripts/rag-agent-e2e-test.mjs`.
2. Обновить SDD под новый факт: strict realistic e2e уже проходит.
3. Решить канонический final answer path.
4. После этого перейти к runtime hardening.

## Канонический Final Answer Path
Для текущего true RAG agent backend канонический final answer path фиксируется так:

1. Основной финальный шаг: `LLMAnswer`.
2. `LLMAnswer` считается основным способом получения финального grounded-ответа в strict realistic agent path.
3. `CitationFormatter` не считается обязательным шагом strict agent path.
4. `CitationFormatter` рассматривается как опциональный post-processing шаг, когда продуктовый сценарий действительно требует отдельного форматирования ссылок или цитат.
5. `LLMCall` не считается каноническим final answer path для текущего strict RAG baseline.

Причины фиксации:
- именно `LLMAnswer` уже подтверждён живым strict e2e;
- `CitationFormatter` полезен, но не должен навязываться агенту как обязательный шаг;
- `LLMCall` остаётся допустимым runtime-механизмом, но не является текущим эталонным путём для strict true RAG agent.

Практическое правило:
- если нужен доказанный strict baseline, считать целевым путь `DocumentLoader -> Chunker -> Embedder -> VectorUpsert -> HybridRetriever -> ContextAssembler -> LLMAnswer`;
- если нужна дополнительная продуктовая полировка ответа, после `LLMAnswer` может добавляться `CitationFormatter`;
- если используется `LLMCall`, это должно считаться альтернативным путём, а не основным baseline-профилем.
