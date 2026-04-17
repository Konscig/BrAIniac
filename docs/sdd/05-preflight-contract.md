# Контракт Preflight-Валидации

## Endpoint
- Method: POST
- Path: /pipelines/:id/validate-graph

## Назначение
Проверить полный граф pipeline перед запуском и вернуть детерминированную диагностику.

## Тело Запроса
```json
{
  "preset": "default"
}
```

Дополнительно допускается query-параметр `preset` со значениями `default | dev | production`.

Валидационный контракт упрощен до preset-only.
Legacy-поля (`mode`, `includeWarnings`, `profileFallback`, `enforceLoopPolicies`, `requireExecutionBudgets`, `roleValidationMode`) не поддерживаются и должны отклоняться.

## Тело Ответа
```json
{
  "valid": false,
  "errors": [
    {
      "code": "GRAPH_UNGUARDED_CYCLE",
      "message": "Cycle is allowed only with loop-policy",
      "details": { "fromNode": 10, "toNode": 4 }
    }
  ],
  "warnings": [
    {
      "code": "GRAPH_ORPHAN_NODE",
      "message": "Node is disconnected",
      "details": { "nodeId": 21 }
    }
  ],
  "metrics": {
    "nodeCount": 14,
    "edgeCount": 16,
    "maxInDegree": 3,
    "maxOutDegree": 4,
    "cycleCount": 2,
    "guardedCycleCount": 1,
    "unguardedCycleCount": 1,
    "estimatedMaxSteps": 240,
    "startNodeCount": 2,
    "endNodeCount": 3
  }
}
```

## Режимы
- default: базовый режим для старта, предупреждения включены, role-проверки в warn-режиме.
- dev: эквивалент default для разработки и миграции.
- production: строгий режим с обязательными execution-budget проверками и strict role-проверками.

## Политика Циклов
- Guarded-циклы допускаются.
- Unguarded-циклы блокируют запуск.
- Для guarded-циклов обязательно наличие maxIterations.

## Политика Типовых Ограничений
Политики валидации определяются только выбранным `preset` и не переопределяются на уровне одного запроса.

## Детерминизм
Для одинакового графа и одинакового набора профилей ответ MUST быть детерминированным.
