# Профили Ролей Узлов

## Канонические Роли
- source
- transform
- control
- sink

## Матрица Ролей (MVP)
| role | input.min | input.max | output.min | output.max | allowed predecessors | allowed successors |
|---|---:|---:|---:|---:|---|---|
| source | 0 | 0 | 1 | 3 | none | transform, control, sink |
| transform | 1 | 5 | 1 | 3 | source, transform, control | transform, control, sink |
| control | 1 | 8 | 1 | 5 | source, transform, control | transform, control, sink |
| sink | 1 | 10 | 0 | 0 | source, transform, control | none |

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
  "allowedPredecessorRoles": ["source", "transform", "control"],
  "allowedSuccessorRoles": ["transform", "control", "sink"],
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
