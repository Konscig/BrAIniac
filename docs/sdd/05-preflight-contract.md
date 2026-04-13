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
  "profileFallback": "warn"
}
```

## Тело Ответа
```json
{
  "valid": false,
  "errors": [
    {
      "code": "GRAPH_CYCLE_DETECTED",
      "message": "Edge would create a cycle",
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
    "hasCycle": true,
    "startNodeCount": 2,
    "endNodeCount": 3
  }
}
```

## Режимы
- strict: hard-нарушения устанавливают valid=false.
- relaxed: hard-проверки также выполняются, но отдельные пробелы профиля могут возвращаться как warnings.

## Детерминизм
Для одинакового графа и одинакового набора профилей ответ MUST быть детерминированным.
