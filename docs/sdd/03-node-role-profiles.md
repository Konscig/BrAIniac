# Профили Ролей Узлов

## Канонические Роли
- source
- transform
- control
- sink

## Термины И Слои (Антипутаница)
- Нода (Node): исполняемая единица графа pipeline (уровень orchestration/runtime).
- Инструмент (Tool): переиспользуемая capability с контрактом input/output/config (уровень бизнес-функции).
- Executor kind: технический способ исполнения ToolNode (например, http-json, openrouter-embeddings).
- Провайдер/адаптер: низкоуровневый транспорт и интеграция с внешним API; это не нода и не инструмент.

Правило: одинаковая бизнес-задача может встречаться на разных слоях, но это не дублирование сущности, а разные точки исполнения.

## Матрица Ролей (MVP)
| role | input.min | input.max | output.min | output.max | allowed predecessors | allowed successors |
|---|---:|---:|---:|---:|---|---|
| source | 0 | 2 | 1 | 5 | any | any |
| transform | 0 | 8 | 0 | 8 | any | any |
| control | 0 | 8 | 0 | 8 | any | any |
| sink | 0 | 10 | 0 | 2 | any | any |

Примечание: значения матрицы являются рекомендуемыми дефолтами (режим warn), а не обязательными hard-ограничениями.

## Профиль AgentCall (Специализированный Transform)
- role: transform
- internalRuntime: enabled
- bounded-лимиты:
  - maxAttempts
  - maxToolCalls
  - maxTimeMs
  - maxCostUsd
  - maxTokens
- выбор инструментов:
  - allowedToolIds or allowedToolNames
- выходной envelope:
  - status
  - answer
  - evidence
  - confidence
  - attemptsUsed
  - toolCallsUsed
  - timing

## Профиль ToolNode (Специализированный Transform)
- role: transform
- назначение: исполнение внешнего или внутреннего инструмента как отдельного шага графа
- обязательный binding инструмента: ui_json.tool_id или ui_json.tool
- обязательный executor kind: один из разрешенных runtime-kind
- контракт: ToolNode исполняет инструмент, но не определяет бизнес-смысл инструмента

## Правило Выбора Слоя Для Одного Шага
- Если нужен прямой одиночный вызов модели без оркестрации инструментов: использовать ноду LLMCall.
- Если нужна переиспользуемая capability-интеграция по контракту: использовать ToolNode + инструмент.
- Если нужна многошаговая стратегия с внутренними tool-calls и лимитами: использовать AgentCall.
- Не дублировать один и тот же смысл одновременно в одном шаге (например, LLMCall и LLMAnswer в ToolNode для одной операции).

## Циклы И Loop-Политика
- Циклы допускаются через любые loop-capable ноды (не только control).
- Для любого циклического маршрута MUST быть задан loop-policy.
- Рекомендуемые поля loop-policy:
  - enabled: true
  - maxIterations: целое >= 1
  - stopCondition: строка или ссылка на условие (опционально)
  - onLimit: break или fail (опционально, дефолт break)
- Для production-режима рекомендуется включать глобальные бюджеты выполнения pipeline.

## Политика Применения Ограничений
- enforcementMode: off | warn | strict
- Рекомендуемый дефолт для MVP: warn
- В strict переводятся только подтвержденные проектом ограничения.

## Fallback-Политика
Если NodeType.config_json отсутствует или неполный:
- role по умолчанию: transform
- диапазон input по умолчанию: 0..10
- диапазон output по умолчанию: 0..10
- валидатор возвращает warning code GRAPH_NODETYPE_PROFILE_MISSING

## Пример NodeType.config_json
```json
{
  "role": "transform",
  "input": { "min": 1, "max": 3 },
  "output": { "min": 1, "max": 2 },
  "allowedPredecessorRoles": ["any"],
  "allowedSuccessorRoles": ["any"],
  "enforcementMode": "warn",
  "loop": {
    "enabled": true,
    "maxIterations": 3,
    "stopCondition": "quality >= 0.8",
    "onLimit": "break"
  },
  "agent": {
    "enabled": true,
    "maxAttempts": 3,
    "maxToolCalls": 8,
    "maxTimeMs": 20000,
    "maxCostUsd": 0.5,
    "maxTokens": 12000,
    "allowedToolNames": ["search", "retriever", "sql"]
  }
}
```
