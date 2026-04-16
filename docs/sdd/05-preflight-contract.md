# Контракт Preflight-Валидации

## Endpoint
- Method: POST
- Path: /pipelines/:id/validate-graph

## Назначение
Проверить полный граф pipeline перед запуском и вернуть детерминированную диагностику.

## Тело Запроса
```json
{
  "mode": "strict",
  "includeWarnings": true,
  "profileFallback": "warn",
  "enforceLoopPolicies": true,
  "requireExecutionBudgets": false,
  "roleValidationMode": "warn"
}
```

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
- strict: hard-нарушения устанавливают valid=false.
- relaxed: hard-проверки также выполняются, но отдельные пробелы профиля могут возвращаться как warnings.

## Политика Циклов
- Guarded-циклы допускаются.
- Unguarded-циклы блокируют запуск.
- Для guarded-циклов обязательно наличие maxIterations.

## Политика Типовых Ограничений
- roleValidationMode=off: role-cardinality и role-compatibility не проверяются.
- roleValidationMode=warn: нарушения role-правил возвращаются как warnings.
- roleValidationMode=strict: нарушения role-правил возвращаются как hard-errors.

## Детерминизм
Для одинакового графа и одинакового набора профилей ответ MUST быть детерминированным.
