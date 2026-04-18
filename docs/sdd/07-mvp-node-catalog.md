# MVP-Каталог Нод

## Backend Baseline Freeze (Start Scope)

Backend-стартовый baseline для исполнения графа фиксируется следующим набором нод:
- ManualInput
- DatasetInput
- ToolNode
- PromptBuilder
- LLMCall
- Parser
- SaveResult
- Filter
- Ranker

Out-of-scope для стартовой итерации исполнения (следующая волна):
- Branch
- Merge
- RetryGate
- LoopGate
- Notify
- Export

Принцип: стартовый baseline должен быть минимально достаточным для RAG-контура без перегруженной архитектуры и без неиспользуемых абстракций.

## Статус Реализации Executor (На 2026-04-18)

Источник проверки: `backend/src/services/application/pipeline/pipeline.executor.node-handlers.ts` (`NODE_HANDLER_REGISTRY`).

Реализованы в текущем executor MVP (эксплуатационный статус см. примечания ниже):
- [x] Trigger
- [x] DatasetInput
- [x] ManualInput
- [x] PromptBuilder
- [x] ToolNode
- [x] LLMCall
- [x] AgentCall
- [x] Parser
- [x] Filter
- [x] Ranker
- [x] SaveResult

Ограничение/требует фикса (на 2026-04-18):
- `LLMCall` реализован в runtime, но в изолированном `ManualInput -> LLMCall` и в realistic e2e регулярно падает с `OPENROUTER_UPSTREAM_ERROR` (HTTP 429/503).
- До исправления устойчивости считать `LLMCall` эксплуатационно нестабильным: требуется retry/backoff и согласованная политика soft-failure для e2e-проверок.

## Результат Аудита Готовности (Код + Фактические Прогоны, На 2026-04-18)

Категории аудита:
- Реализовано: есть handler и рабочий runtime-path.
- Частично готово: функциональность есть, но подтверждена только в тестовом/контрактном режиме или с ограничениями.
- Не готово: handler отсутствует или поведение не подтверждено как рабочее.

Ноды runtime:
- Trigger: реализовано; базовый source-узел работает.
- ManualInput: реализовано; передача `input_json` работает.
- DatasetInput: реализовано; требует валидный dataset.
- PromptBuilder: реализовано; базовая сборка prompt работает.
- Filter: реализовано; rule-based фильтрация работает.
- Ranker: реализовано; эвристическое ранжирование работает.
- Parser: реализовано; базовый JSON parse path работает.
- SaveResult: частично готово; формирует `save_result` output и preview, но не выполняет отдельный целевой sink/export-процесс, кроме общего сохранения `output_json` executor-ом.
- ToolNode: частично готово; универсальный executor-path работает, но фактическое поведение инструмента зависит от executor-конфига и contract-режима.
- AgentCall: частично готово; internal tool-calling loop реализован и проходит `test:agent:e2e`, но успешность в этом тесте достигается в режиме forced `/health` executor и допускает `provider_soft_failure`.
- LLMCall: реализовано в коде, но эксплуатационно нестабильно из-за OpenRouter upstream/rate-limit ошибок (изолированные и realistic прогоны показывают регулярный `OPENROUTER_UPSTREAM_ERROR`).
- Branch / Merge / RetryGate / LoopGate / Notify / Export: не готово, runtime возвращает `kind: not_implemented`.

Зафиксированные расхождения с заявленным функционалом:
- Успех `agent:e2e` подтверждает внутреннюю оркестрацию AgentCall, но не подтверждает полноценную работу внешних инструментальных интеграций.
- В текущем MVP AgentCall вызывает инструменты внутри одной ноды (internal tool-calls), а не переключает выполнение графа на отдельные ToolNode-ноды по шагам.

Подтверждение по AgentCall tool-calling:
- Внутренний bounded loop с реальными вызовами инструментов в AgentCall реализован в `backend/src/services/application/node/handlers/agent-call.node-handler.ts`.
- Автономная проверка сценария `ManualInput -> AgentCall` зафиксирована отдельным e2e-скриптом: `npm --prefix backend run test:agent:e2e`.

Определены в каталоге, но пока без handler (возвращается `kind: not_implemented`):
- [ ] Branch
- [ ] Merge
- [ ] RetryGate
- [ ] LoopGate
- [ ] Notify
- [ ] Export

## Граница Документа (Важно)
- Этот каталог описывает ноды графа исполнения (runtime/orchestration слой).
- Каталог инструментов (capabilities) описан отдельно в `./08-rag-toolkit.md`.
- Профили ролей и правила применения ограничений описаны в `./03-node-role-profiles.md`.
- Совпадение названий по смыслу между нодой и инструментом не означает, что это одна и та же сущность.

## Source
1. Trigger
- purpose: старт пайплайна по событию, расписанию или ручному запуску
- input: 0..0
- output: 1..3
- predecessors: any (рекомендуется none)
- successors: any

2. DatasetInput
- purpose: чтение входного датасета или документов
- input: 0..0
- output: 1..3
- predecessors: any (рекомендуется none)
- successors: any

3. ManualInput
- purpose: пользовательский ввод параметров запуска или промпта
- input: 0..0
- output: 1..2
- predecessors: any (рекомендуется none)
- successors: any

## Transform
4. PromptBuilder
- purpose: сборка промпта из шаблонов и входных полей
- input: 1..5
- output: 1..2
- predecessors: any
- successors: any

5. LLMCall
- purpose: вызов LLM или агентной модели
- input: 1..3
- output: 1..2
- predecessors: any
- successors: any
- note: это нода уровня графа для прямого вызова модели.
- note: не тождественна инструменту `LLMAnswer` из `./08-rag-toolkit.md`.
- note: текущий known issue - нестабильность при вызове внешнего провайдера (серия `OPENROUTER_UPSTREAM_ERROR`/429/503 в e2e); требует отдельного фикса устойчивости.

6. AgentCall
- purpose: запуск агентного runtime внутри одной ноды
- input: 1..3
- output: 1..2
- internals: bounded runtime loop с вызовами инструментов
- predecessors: any
- successors: any
- note: AgentCall отвечает за оркестрацию стратегии, а не за каталогизацию инструментов.
- note: поддержан внутренний tool-calling protocol (`tool_call` / `final`) и fallback planner при soft-сбоях внешнего LLM-провайдера.

7. Parser
- purpose: парсинг, нормализация и структурирование результата
- input: 1..4
- output: 1..3
- predecessors: any
- successors: any

8. Filter
- purpose: фильтрация данных по правилам
- input: 1..3
- output: 1..2
- predecessors: any
- successors: any
- note: baseline utility; не обязателен для первого минимального RAG-контура из `./08-rag-toolkit.md`.

9. Ranker
- purpose: ранжирование кандидатов или ответов
- input: 1..5
- output: 1..2
- predecessors: any
- successors: any
- note: baseline utility; для первого минимального RAG-контура может быть отложен.

10. ToolNode
- purpose: инструмент как отдельная нода (вход -> исполнение -> выход)
- input: 0..8
- output: 0..8
- predecessors: any
- successors: any
- note: ToolNode исполняет контракт инструмента; сам инструмент определяется в `./08-rag-toolkit.md`.
- note: executor kind относится к runtime-конфигурации ToolNode, а не к каталогу нод.
- note: текущие runtime-kind: `http-json`, `openrouter-embeddings`.
- note: для исполнения требуется явный binding инструмента и явный executor kind.
- note: маршрут AgentCall -> ToolNode -> AgentCall допустим при loop-policy

## Control
11. Branch
- purpose: ветвление потока по условию
- input: 1..1
- output: 2..5
- predecessors: any
- successors: any

12. Merge
- purpose: слияние нескольких веток в один поток
- input: 2..8
- output: 1..2
- predecessors: any
- successors: any

13. RetryGate
- purpose: управление политикой повторов и отказов
- input: 1..2
- output: 1..2
- predecessors: any
- successors: any
- note: обратное ребро допускается только при заданном maxIterations

14. LoopGate
- purpose: явное управление циклами (while/until) в графе
- input: 1..2
- output: 1..2
- predecessors: any
- successors: any
- note: должен задавать maxIterations

## Sink
15. SaveResult
- purpose: сохранение результата в БД или хранилище
- input: 1..10
- output: 0..0
- predecessors: any
- successors: any (рекомендуется none)

16. Notify
- purpose: отправка уведомления или webhook по результату
- input: 1..10
- output: 0..0
- predecessors: any
- successors: any (рекомендуется none)

17. Export
- purpose: экспорт результата во внешний формат или систему
- input: 1..10
- output: 0..0
- predecessors: any
- successors: any (рекомендуется none)

## Правила Каталога
- Жесткое правило: для любого цикла обязателен maxIterations в JSON.
- Циклы допускаются между любыми loop-capable нодами.
- Source/Sink-ограничения являются рекомендацией по умолчанию (режим warn).
- Role-совместимость является режимной проверкой: off/warn/strict.

## Связанные Документы
- Подробный список инструментов для будущего RAG-агента: ./08-rag-toolkit.md
