# Профили Ролей Узлов

## Канонические роли
- `source`
- `transform`
- `control`
- `sink`

## Разделение слоёв
- Node: исполняемая вершина графа на уровне pipeline/runtime.
- Tool: переиспользуемая capability с контрактами input/output/config.
- Executor kind: технический способ исполнения инструмента.
- Provider/adapter: транспорт и интеграция, а не отдельная нода.

## Базовая матрица
| role | input.min | input.max | output.min | output.max |
|---|---:|---:|---:|---:|
| source | 0 | 2 | 1 | 5 |
| transform | 0 | 8 | 0 | 8 |
| control | 0 | 8 | 0 | 8 |
| sink | 0 | 10 | 0 | 2 |

Это рекомендуемые дефолты, а не жёсткие ограничения сами по себе.

## Профиль AgentCall
- role: `transform`
- internalRuntime: enabled
- bounded limits:
  - `maxAttempts`
  - `maxToolCalls`
  - `maxTimeMs`
  - `maxCostUsd`
  - `maxTokens`
- output envelope:
  - `status`
  - `answer`
  - `evidence`
  - `confidence`
  - `attemptsUsed`
  - `toolCallsUsed`
  - `timing`

Важно:
- `AgentCall` может оркестрировать tool-calls внутри себя.
- Набор инструментов, доступных `AgentCall`, приходит только через входящие рёбра графа.
- `AgentCall` не имеет скрытого локального каталога callable tools.
- Канонический способ рекламы инструмента агенту: `ToolNode -> AgentCall`.
- Любые input-based механики вида `tool_ref` / `tool_refs` не считаются допустимым runtime-путём.

## Профиль ToolNode
- role: `transform`
- обязательный binding инструмента: `ui_json.tool_id` или `ui_json.tool`
- обязательный executor kind: один из поддерживаемых runtime kinds
- допускает два режима:
  - capability-режим без входов: публикует advertising-output для `AgentCall`
  - execution-режим с входами: исполняет инструмент как шаг графа

## Правило выбора слоя
- Использовать `LLMCall`, если нужен прямой одиночный вызов модели.
- Использовать `ToolNode`, если переиспользуемый tool contract должен исполняться как шаг графа.
- Использовать `AgentCall`, если нужна ограниченная по ресурсам многошаговая стратегия.
- `PromptBuilder` считать advanced-only узлом: он допустим в runtime, но не входит в канонический агентный сценарий.

## Loop policy
- Циклы допустимы только при явной loop policy.
- Рекомендуемые поля:
  - `enabled`
  - `maxIterations`
  - `stopCondition`
  - `onLimit`

## Fallback policy
Если `NodeType.config_json` отсутствует или неполный:
- роль по умолчанию: `transform`
- диапазон input по умолчанию: `0..10`
- диапазон output по умолчанию: `0..10`
- валидатор возвращает warning, а не hard failure, если проект не требует production-строгости

## Пример NodeType.config_json
```json
{
  "role": "transform",
  "input": { "min": 1, "max": 3 },
  "output": { "min": 1, "max": 2 },
  "enforcementMode": "warn",
  "loop": {
    "enabled": true,
    "maxIterations": 3,
    "onLimit": "break"
  },
  "agent": {
    "enabled": true,
    "maxAttempts": 3,
    "maxToolCalls": 8,
    "maxTimeMs": 20000,
    "maxCostUsd": 0.5,
    "maxTokens": 12000
  }
}
```
