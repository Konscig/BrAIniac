# Contract: `POST /datasets/upload` (kind=rag-corpus) — Phase 1

**Branch**: `002-rag-dataset-tool` | **Date**: 2026-04-30
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

Расширение существующего эндпоинта загрузки. Параметр `kind` — опциональный дискриминатор источника файла. Существующее поведение (без `kind` или `kind: 'golden'`) **не изменяется**.

---

## URL И Метод

```text
POST /datasets/upload
Authorization: Bearer <jwt>
Content-Type: application/json
```

Аутентификация — стандартный middleware `requireAuth`.

---

## Request Body

```json
{
  "filename": "manual.txt",
  "content_base64": "...",
  "kind": "rag-corpus",
  "fk_pipeline_id": 42
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `filename` | string | да | Имя файла, включая расширение. |
| `content_base64` | string | да | Содержимое файла в base64. |
| `kind` | `"golden" \| "rag-corpus"` | нет, default `"golden"` | Дискриминатор. |
| `fk_pipeline_id` | int | для `golden` — да; для `rag-corpus` — нет | Привязка к пайплайну только для golden datasets (используется таблицей `Dataset`). |

### Валидация (kind=rag-corpus)

| Условие | HTTP | Код Ошибки |
|---------|------|------------|
| `filename` пуст или содержит запрещённые символы (`/`, `\`, `..`) | 400 | `RAG_CORPUS_FILENAME_INVALID` |
| Расширение не в `{.txt, .sql, .csv}` | 400 | `RAG_DATASET_FORMAT_INVALID` |
| `content_base64` не декодируется | 400 | `RAG_CORPUS_CONTENT_INVALID` |
| Размер декодированного содержимого > 1 МБ | 413 | `RAG_DATASET_SIZE_EXCEEDED` |
| Декодированное содержимое не UTF-8 | 400 | `RAG_DATASET_ENCODING_INVALID` |

---

## Response

### Success (200 OK)

```json
{
  "uri": "workspace://backend/.artifacts/rag-corpus/<project_token>/manual.txt",
  "filename": "manual.txt",
  "size_bytes": 12345,
  "kind": "rag-corpus"
}
```

### Поля Ответа (kind=rag-corpus)

| Поле | Описание |
|------|----------|
| `uri` | Стабильный URI для использования в `Node.config_json.uris[]`. |
| `filename` | Имя файла после sanitization (может отличаться от запрошенного). |
| `size_bytes` | Точный размер файла на диске. |
| `kind` | Эхо параметра запроса. |

В отличие от `kind=golden`, в ответе **нет** `dataset_id` — корпус не пишется в таблицу `Dataset`.

### Errors

```json
{
  "error": "Размер файла превышает лимит 1 МБ.",
  "code": "RAG_DATASET_SIZE_EXCEEDED",
  "details": {
    "filename": "huge.txt",
    "size_bytes": 5242880,
    "limit_bytes": 1048576
  }
}
```

---

## Идемпотентность

Заголовок `x-idempotency-key` (опционально): если повторно отправить тот же ключ с тем же содержимым, эндпоинт ДОЛЖЕН вернуть тот же `uri` без создания дубликата файла.

При коллизии имени без idempotency-key к имени файла на диске добавляется суффикс `-<short_hash>`, в ответе возвращается итоговое `filename` и URI.

---

## Backward Compatibility

| Сценарий | Поведение |
|----------|-----------|
| Запрос без `kind` | как `kind: "golden"` (текущее поведение, frozen) |
| Запрос с `kind: "golden"` | то же самое (frozen path) |
| Запрос с `kind: "rag-corpus"` | новая ветка, описанная в этом контракте |
| Запрос с любым другим `kind` | 400 `INVALID_KIND` |

Существующие clients не ломаются.

---

## Правила Хранения На Диске

```text
backend/.artifacts/rag-corpus/<project_token>/<sanitized_filename>
```

`<project_token>` — детерминированно производится от `req.user.user_id` (или, в будущем, от связи с проектом). Для MVP допустимо использовать `user_<user_id>`.

После записи файла:

1. Файл создаётся атомарно (`fs.writeFile` в temp + `rename`).
2. Возвращается канонический URI.

---

## Observability

Эндпоинт ДОЛЖЕН логировать:

```text
[upload] kind=rag-corpus user_id=42 filename=manual.txt size_bytes=12345 result=ok
```

При ошибке:

```text
[upload] kind=rag-corpus user_id=42 filename=huge.txt size_bytes=5242880 result=fail code=RAG_DATASET_SIZE_EXCEEDED
```

Логи попадают в общий поток backend (stdout). Никаких отдельных аудит-таблиц не требуется.
