# MVP-Каталог Нод

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

6. AgentCall
- purpose: запуск агентного runtime внутри одной ноды
- input: 1..3
- output: 1..2
- internals: bounded runtime loop с вызовами инструментов
- predecessors: any
- successors: any

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

9. Ranker
- purpose: ранжирование кандидатов или ответов
- input: 1..5
- output: 1..2
- predecessors: any
- successors: any

10. ToolNode
- purpose: инструмент как отдельная нода (вход -> исполнение -> выход)
- input: 0..8
- output: 0..8
- predecessors: any
- successors: any
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
