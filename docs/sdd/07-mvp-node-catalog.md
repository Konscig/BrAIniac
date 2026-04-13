# MVP-Каталог Нод

## Source
1. Trigger
- purpose: старт пайплайна по событию, расписанию или ручному запуску
- input: 0..0
- output: 1..3
- predecessors: none
- successors: transform, control, sink

2. DatasetInput
- purpose: чтение входного датасета или документов
- input: 0..0
- output: 1..3
- predecessors: none
- successors: transform, control

3. ManualInput
- purpose: пользовательский ввод параметров запуска или промпта
- input: 0..0
- output: 1..2
- predecessors: none
- successors: transform, control

## Transform
4. PromptBuilder
- purpose: сборка промпта из шаблонов и входных полей
- input: 1..5
- output: 1..2
- predecessors: source, transform, control
- successors: transform, control

5. LLMCall
- purpose: вызов LLM или агентной модели
- input: 1..3
- output: 1..2
- predecessors: source, transform, control
- successors: transform, control, sink

6. AgentCall
- purpose: запуск агентного runtime внутри одной ноды
- input: 1..3
- output: 1..2
- internals: bounded runtime loop с вызовами инструментов
- predecessors: source, transform, control
- successors: transform, control, sink

7. Parser
- purpose: парсинг, нормализация и структурирование результата
- input: 1..4
- output: 1..3
- predecessors: source, transform, control
- successors: transform, control, sink

8. Filter
- purpose: фильтрация данных по правилам
- input: 1..3
- output: 1..2
- predecessors: source, transform, control
- successors: transform, control, sink

9. Ranker
- purpose: ранжирование кандидатов или ответов
- input: 1..5
- output: 1..2
- predecessors: source, transform, control
- successors: transform, control, sink

## Control
10. Branch
- purpose: ветвление потока по условию
- input: 1..1
- output: 2..5
- predecessors: source, transform, control
- successors: transform, control, sink

11. Merge
- purpose: слияние нескольких веток в один поток
- input: 2..8
- output: 1..2
- predecessors: source, transform, control
- successors: transform, control, sink

12. RetryGate
- purpose: управление политикой повторов и отказов
- input: 1..2
- output: 1..2
- predecessors: source, transform, control
- successors: transform, control, sink
- note: обратное ребро запрещено в strict DAG

## Sink
13. SaveResult
- purpose: сохранение результата в БД или хранилище
- input: 1..10
- output: 0..0
- predecessors: source, transform, control
- successors: none

14. Notify
- purpose: отправка уведомления или webhook по результату
- input: 1..10
- output: 0..0
- predecessors: source, transform, control
- successors: none

15. Export
- purpose: экспорт результата во внешний формат или систему
- input: 1..10
- output: 0..0
- predecessors: source, transform, control
- successors: none

## Правила Каталога
- Source не имеет входящих ребер.
- Sink не имеет исходящих ребер.
- Любая мутация должна сохранять ацикличность.
- Совместимость ролей должна валидироваться.
