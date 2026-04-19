# Профили Ролей Узлов

## Канонические Роли
- `source`
- `transform`
- `control`
- `sink`

## Разделение Слоёв
- Node: исполняемая единица графа на уровне pipeline/runtime.
- Tool: переиспользуемая capability с контрактами input/output/config.
- Executor kind: технический режим исполнения инструмента.
- Provider/adapter: низкоуровневая интеграция и транспорт, а не нода и не инструмент.

## Рекомендуемая Базовая Матрица
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
- Набор инструментов, доступных `AgentCall`, должен приходить только через входящие рёбра графа.
- `AgentCall` не должен иметь скрытый локальный каталог callable tools в config ноды.
- Предпочтительный формат edge-артефактов: явные payloads `tool_ref` / `tool_refs`; прямые outputs `ToolNode` тоже допустимы, если они подключены рёбрами.

## Профиль ToolNode
- role: `transform`
- назначение: выполнить один явный инструмент как шаг графа
- обязательный binding инструмента: `ui_json.tool_id` или `ui_json.tool`
- обязательный executor kind: один из поддерживаемых runtime kinds

## Правило Выбора Слоя
- Использовать `LLMCall`, если нужен прямой одиночный вызов модели.
- Использовать `ToolNode`, если переиспользуемый tool contract должен исполняться как шаг графа.
- Использовать `AgentCall`, если нужна ограниченная по ресурсам многошаговая стратегия.

## Loop Policy
- Циклы допустимы только при явной loop policy.
- Рекомендуемые поля loop policy:
  - `enabled`
  - `maxIterations`
  - `stopCondition`
  - `onLimit`

## Fallback Policy
Если `NodeType.config_json` отсутствует или неполный:
- роль по умолчанию: `transform`
- диапазон input по умолчанию: `0..10`
- диапазон output по умолчанию: `0..10`
- валидатор возвращает warning, а не hard failure, если только проект не требует более строгого режима

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
