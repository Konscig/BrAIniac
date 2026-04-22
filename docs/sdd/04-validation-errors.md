# Каталог Ошибок Валидации

## Формат Ответа
```json
{
  "code": "GRAPH_UNGUARDED_CYCLE",
  "message": "Cycle is allowed only with loop-policy",
  "details": { "pipelineId": 12, "edge": { "from": 9, "to": 3 } }
}
```

## Коды Ошибок (MVP)
| code | http | type | when |
|---|---:|---|---|
| GRAPH_UNGUARDED_CYCLE | 400 | hard | обнаружен цикл без loop-policy |
| GRAPH_LOOP_POLICY_REQUIRED | 400 | hard | для цикла отсутствует обязательная loop-policy |
| GRAPH_LOOP_MAX_ITER_INVALID | 400 | hard | maxIterations отсутствует или <= 0 |
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
| GRAPH_GUARDED_CYCLE | warning | обнаружен допустимый цикл с loop-policy |
| GRAPH_ROLE_INPUT_LIMIT | warning | входящая степень выходит за рекомендованный диапазон |
| GRAPH_ROLE_OUTPUT_LIMIT | warning | исходящая степень выходит за рекомендованный диапазон |
| GRAPH_ROLE_COMPATIBILITY | warning | пара ролей выходит за рекомендуемые матрицы |
| GRAPH_EXECUTION_BUDGET_MISSING | warning | не заданы бюджеты выполнения pipeline |

## Политика Стабильности
- Коды являются стабильной частью API-контракта.
- Текст сообщения может меняться, семантика кода меняться не должна.
