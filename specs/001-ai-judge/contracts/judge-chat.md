# Contract: Judge Chat API

**Feature**: `001-ai-judge`
**Surface**: новый публичный контракт, поведенчески совместим с референсной
ветки `judge-agent` (маршруты `/judge/chat`, `/judge/history`), но собран на
слоистой архитектуре проекта.
**Auth**: Bearer JWT, привязан к `User`. История диалога приватна в пределах
`Project` (FR-ARCH-002, FR-024).

---

## `POST /judge/chat`

Отправить сообщение судье. Открывает диалог или продолжает существующий.

### Headers

- `Authorization: Bearer <JWT>` — required.

### Request body

```json
{
  "project_id": 21,
  "conversation_id": 3,
  "assessment_id": 42,
  "message": "Объясни, почему f_faith = 0.42"
}
```

| Поле | Тип | Обязательность | Комментарий |
|------|-----|----------------|-------------|
| `project_id` | int | required | владелец JWT MUST иметь доступ |
| `conversation_id` | int | optional | если отсутствует — создаётся новый диалог |
| `assessment_id` | int | optional | привязка к конкретной оценке для контекста |
| `message` | string | required, non-empty | user message |

### Response — 200 OK

```json
{
  "conversation_id": 3,
  "assistant_message": {
    "message_id": 128,
    "role": "assistant",
    "content": "На трёх элементах датасета ответ не опирался на context...",
    "created_at": "2026-04-23T12:41:03.000Z"
  },
  "tool_calls_executed": [
    {
      "tool_call_id": "tc_1",
      "tool_name": "getMetrics",
      "input": { "assessment_id": 42 },
      "output_preview": { "f_faith": 0.42, "f_corr": 0.66 }
    }
  ]
}
```

Если судья выполнил несколько tool-calls последовательно, `tool_calls_executed`
содержит все записи в порядке выполнения.

### Response — 404

`project_id` / `conversation_id` / `assessment_id` не доступны владельцу.
`404` вместо `403` — R13.

### Response — 400

Невалидный `message` или `conversation_id`, не принадлежащий `project_id`.

---

## `GET /judge/history?conversation_id=<id>&limit=<n>&before_message_id=<id>`

Стрим истории одного диалога. По умолчанию `limit = 50`, максимум `200`.
Пагинация — cursor-based через `before_message_id` (для дозагрузки прошлого).

### Response — 200 OK

```json
{
  "conversation_id": 3,
  "project_id": 21,
  "assessment_id": 42,
  "created_at": "2026-04-23T12:40:00.000Z",
  "messages": [
    {
      "message_id": 127,
      "role": "user",
      "content": "Объясни, почему f_faith = 0.42",
      "created_at": "2026-04-23T12:40:59.000Z"
    },
    {
      "message_id": 128,
      "role": "assistant",
      "content": "...",
      "created_at": "2026-04-23T12:41:03.000Z"
    },
    {
      "message_id": 129,
      "role": "tool",
      "tool_name": "getMetrics",
      "tool_call_id": "tc_1",
      "content": "{\"f_faith\": 0.42, ...}",
      "created_at": "2026-04-23T12:41:04.000Z"
    }
  ],
  "has_more": false
}
```

### Response — 404

`conversation_id` не принадлежит владельцу.

---

## Tool-calls, доступные судье

Минимальный набор (FR-022). Полный набор может расширяться без MAJOR-bump:

| Tool | Input | Output | Комментарий |
|------|-------|--------|-------------|
| `getNode` | `{ node_id: int }` | `{ node_id, label, category, type, status, config? }` | по аналогии с `judge-agent` |
| `getMetrics` | `{ assessment_id: int }` или `{ run_task_id: int }` | `{ metric_code: value }` map | |
| `getLogs` | `{ run_task_id: int }` или `{ assessment_item_id: int }` | `{ log_lines: [...], tool_call_trace: [...] }` | |

Семантика tool-calls: полезная нагрузка возвращается судье как `role = tool`
сообщение, и он формирует следующий ответ. Все tool-calls MUST исполняться
через сервисный слой (FR-ARCH-001): handler → application-service → data-service.

---

## Замороженные поля

- На ответе `/judge/chat`: `conversation_id`, `assistant_message.{message_id,
  role, content, created_at}`, `tool_calls_executed[].{tool_name, input,
  output_preview}`.
- На ответе `/judge/history`: `messages[].{message_id, role, content,
  created_at}` (поля `tool_name`, `tool_call_id` обязательны только при
  `role = tool`), `has_more`.
- Значения `role` ограничены множеством `{user, assistant, tool}`.

Расширение tool-calls новыми инструментами MINOR. Изменение сигнатуры
существующего tool-call (переименование, удаление обязательных полей) — MAJOR.
