# Каталог Ошибок Валидации

## Формат Ответа
```json
{
  "code": "GRAPH_CYCLE_DETECTED",
  "message": "Edge would create a cycle",
  "details": { "pipelineId": 12, "edge": { "from": 9, "to": 3 } }
}
```

## Коды Ошибок (MVP)
| code | http | type | when |
|---|---:|---|---|
| GRAPH_ROLE_INPUT_LIMIT | 400 | hard | входящая степень нарушает диапазон role input |
| GRAPH_ROLE_OUTPUT_LIMIT | 400 | hard | исходящая степень нарушает диапазон role output |
| GRAPH_ROLE_COMPATIBILITY | 400 | hard | пара predecessor/successor role запрещена |
| GRAPH_CYCLE_DETECTED | 400 | hard | операция создает цикл |
| GRAPH_SELF_LOOP | 400 | hard | ребро из узла в него же |
| GRAPH_CROSS_PIPELINE_EDGE | 400 | hard | ребро соединяет узлы разных pipeline |
| GRAPH_NODETYPE_PROFILE_MISSING | 400 or 200 warning | hard/soft by mode | профиль не найден или неполный |
| GRAPH_NODE_NOT_FOUND | 404 | hard | указанный node не существует |
| GRAPH_PIPELINE_NOT_FOUND | 404 | hard | указанный pipeline не существует |
| GRAPH_FORBIDDEN | 403 | hard | нарушение ownership/auth |

## Коды Предупреждений (Preflight)
| code | severity | when |
|---|---|---|
| GRAPH_ORPHAN_NODE | warning | node отключен от полезного потока |
| GRAPH_COMPLEXITY_HIGH | warning | превышены пороги сложности |
| GRAPH_PROFILE_DEFAULTED | warning | применен fallback-профиль |

## Политика Стабильности
- Коды являются стабильной частью API-контракта.
- Текст сообщения может меняться, семантика кода меняться не должна.
