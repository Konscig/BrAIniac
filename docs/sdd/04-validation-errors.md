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

## Коды Ошибок RAG Dataset Tool

Введены feature 002-rag-dataset-tool. Все сообщения возвращаются на русском (FR-015 спеки).

| code | http | type | when |
|---|---:|---|---|
| RAG_DATASET_FILE_LIST_EMPTY | 400 | hard | в `Node.ui_json` узла RAGDataset нет ни одного URI |
| RAG_DATASET_FILE_LIST_TOO_LONG | 400 | hard | превышен лимит количества файлов на узел (64) |
| RAG_DATASET_URI_INVALID | 400 | hard | URI не начинается с `workspace://backend/.artifacts/rag-corpus/` или path traversal |
| RAG_DATASET_FORMAT_INVALID | 400 | hard | расширение файла не входит в `{.txt, .sql, .csv}` |
| RAG_DATASET_FILE_DUPLICATE | 400 | hard | дубликат URI в списке файлов одного узла |
| RAG_DATASET_FILE_NOT_FOUND | 400 | hard (runtime) | файл по URI отсутствует на диске на момент исполнения |
| RAG_DATASET_SIZE_EXCEEDED | 400 / 413 | hard | размер файла превышает 1 МБ (1 048 576 байт); 413 при загрузке, 400 при чтении |
| RAG_DATASET_ENCODING_INVALID | 400 | hard | файл не декодируется как UTF-8 |
| RAG_DATASET_FILE_READ_ERROR | 400 | hard | прочие проблемы чтения (IO, права доступа) |
| RAG_CORPUS_FILENAME_INVALID | 400 | hard | filename содержит запрещённые символы (`/`, `\`, `..`, `\0`, etc.) |
| RAG_CORPUS_CONTENT_INVALID | 400 | hard | content_base64 невалиден / не декодируется |
| INVALID_KIND | 400 | hard | неизвестное значение поля `kind` в `POST /datasets/upload` |

Семантика кодов и контракт ответа описаны в [specs/002-rag-dataset-tool/contracts/](../../specs/002-rag-dataset-tool/contracts/).

## Политика Стабильности
- Коды являются стабильной частью API-контракта.
- Текст сообщения может меняться, семантика кода меняться не должна.
