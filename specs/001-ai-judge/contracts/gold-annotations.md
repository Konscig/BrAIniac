# Contract: Gold Annotations API

**Feature**: `001-ai-judge`
**Surface**: новый публичный контракт; ресурс «эталонная разметка»
независим от `POST /datasets/upload`.
**Auth**: Bearer JWT; ownership по цепочке `User → Project → Pipeline →
Dataset → Document`.

---

## Формат записи `GoldAnnotation`

```json
{
  "gold_annotation_id": 17,
  "document_id": 401,
  "dataset_item_key": "qa-007",
  "annotation_type": "answer",
  "payload": { "text": "42" },
  "version": 2,
  "current": true,
  "author_user_id": 7,
  "created_at": "2026-04-23T10:00:00.000Z"
}
```

Замороженные поля записи: `gold_annotation_id`, `document_id`,
`annotation_type`, `payload`, `version`, `current`, `created_at`.
`dataset_item_key` денорма из `Document` — включена в ответ для удобства
frontend.

### Допустимые `annotation_type`

Множество стабильное; новые типы MINOR.

- `answer` — payload `{ "text": string, "normalized_form"?: string }`.
- `claims` — payload `{ "claims": string[] }`.
- `relevant_docs` — payload `{ "doc_ids": (string | int)[] }`.
- `tool_trajectory` — payload `{ "steps": [{ "tool_name": string, "args"?: object }] }`.
- Иные типы могут вводиться добавлением через MINOR-bump контракта.

---

## `POST /datasets/:dataset_id/gold-annotations`

Создание одной или нескольких разметок.

### Request body — single

```json
{
  "document_id": 401,
  "annotation_type": "answer",
  "payload": { "text": "42" }
}
```

### Request body — batch

```json
{
  "items": [
    { "document_id": 401, "annotation_type": "answer", "payload": { "text": "42" } },
    { "document_id": 401, "annotation_type": "relevant_docs", "payload": { "doc_ids": ["d1", "d2"] } }
  ]
}
```

### Response — 201 Created

- Для single — одиночный объект `GoldAnnotation`.
- Для batch — `{ "created": [ ...GoldAnnotation ] }`.

### Response — 400

- Неизвестный `annotation_type`.
- `payload` не соответствует схеме для своего типа.
- `document_id` не принадлежит `dataset_id`.

### Response — 404

`dataset_id` / `document_id` не доступны владельцу.

### Response — 409

Одновременное создание разметки того же `(document_id, annotation_type)`
двумя запросами — второй получает `409 Conflict`; первый побеждает.
Стандартный сценарий эволюции — `PUT`, а не параллельный `POST`.

---

## `GET /datasets/:dataset_id/gold-annotations?annotation_type=<type>&document_id=<id>&include_history=<bool>`

Перечисление разметок датасета.

### Query params

| Имя | Тип | По умолчанию |
|-----|-----|--------------|
| `annotation_type` | string | не фильтровать |
| `document_id` | int | не фильтровать |
| `include_history` | bool | `false` (возвращаются только `current = true`) |

### Response — 200 OK

```json
{
  "dataset_id": 173,
  "items": [ /* массив GoldAnnotation */ ],
  "has_more": false
}
```

---

## `PUT /gold-annotations/:gold_annotation_id`

Ревизия разметки. Сервер инкрементирует `version`, создаёт новую строку,
снимает `current = false` с предыдущей. Идентификатор в URL — стабильный
identifier любой из версий разметки данной пары `(document_id, annotation_type)`;
сервер автоматически определяет предыдущую `current`-версию.

### Request body

```json
{
  "payload": { "text": "42 (revised)" }
}
```

### Response — 200 OK

Возвращается новая версия `GoldAnnotation` с обновлённым `version`, `current = true`.

### Response — 404

Запись с `gold_annotation_id` не существует или не принадлежит владельцу.

### Инварианты

- Предыдущие `JudgeAssessment`, ссылавшиеся на прошлую версию через
  `JudgeAssessmentFrozenGold`, MUST продолжать видеть свой снапшот и
  MUST NOT пересчитываться автоматически.
- Ответ НЕ включает предыдущие версии; их можно увидеть через
  `GET /datasets/:id/gold-annotations?include_history=true`.

---

## `DELETE /gold-annotations/:gold_annotation_id`

Soft-delete текущей версии. Поле `deleted_at` выставляется, `current` снимается.
Предыдущие версии остаются как исторические записи.

### Response — 204 No Content

### Response — 404

Запись не существует / не принадлежит владельцу.

### Инварианты

- Assessment'ы со `JudgeAssessmentFrozenGold` на удалённую версию
  MUST продолжать работать.
- Если `annotation_type` для этого документа становится полностью
  отсутствующим, новые assessment'ы, требующие этой разметки, MUST
  отмечать соответствующие метрики как `unavailable` (FR-030, FR-032a).

---

## Политика версионирования

- Добавление нового `annotation_type` — MINOR.
- Изменение схемы `payload` существующего типа — MAJOR.
- Добавление опциональных полей в запись `GoldAnnotation` — MINOR.
- Удаление полей записи — MAJOR.
