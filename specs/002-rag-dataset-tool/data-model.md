# Data Model: RAG Dataset Tool — Phase 1

**Branch**: `002-rag-dataset-tool` | **Date**: 2026-04-30
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Фича не вводит новых таблиц. Все сущности живут на существующей схеме (`Tool`, `NodeType`, `Node.config_json`) или в файловой системе под workspace root.

---

## Сущность 1: `Tool` — Запись Каталога Тула «RAG Dataset»

**Хранение**: существующая таблица `Tool` (Postgres).
**Идентификация**: `name = 'rag-dataset'` (уникальный код, нижний регистр, kebab-case).

### Поля

| Поле | Тип | Источник Значения | Обязательно |
|------|-----|-------------------|-------------|
| `tool_id` | `int` (autoincrement) | БД | да |
| `name` | `char(64)` `@unique` | seed | да |
| `config_json` | `Json` | seed | да |

### Структура `config_json`

```json
{
  "display_name": "RAG Dataset",
  "description": "Подключает корпус документов (txt/sql/csv) к RAG-агенту через управляемое хранилище",
  "category": "rag",
  "supported_formats": ["txt", "sql", "csv"],
  "max_file_size_bytes": 1048576,
  "max_files_per_node": 64,
  "uri_prefix": "workspace://backend/.artifacts/rag-corpus/",
  "output_schema_version": 1,
  "drop_in_compatible_with": ["DocumentLoader"]
}
```

### Правила

- `display_name`, `description` — для UI каталога.
- `supported_formats` ДОЛЖНО содержать ровно `["txt", "sql", "csv"]` в первом релизе.
- `max_file_size_bytes` ДОЛЖНО быть `1048576` (1 МБ ровно).
- `max_files_per_node` ДОЛЖНО быть `64` (см. assumption в spec).
- `output_schema_version` инкрементируется при breaking-изменении формы выхода узла.

### Идемпотентность Seed

```text
1. SELECT * FROM "Tool" WHERE name = 'rag-dataset'
2. Если запись есть — UPDATE config_json (по полям, не затирая чужие)
3. Если нет — INSERT
```

---

## Сущность 2: `NodeType` — Тип Узла «RAG Dataset»

**Хранение**: существующая таблица `NodeType` (Postgres).
**Идентификация**: `name = 'RAGDataset'` (CamelCase, по образцу `DocumentLoader`).

### Поля

| Поле | Тип | Источник Значения | Обязательно |
|------|-----|-------------------|-------------|
| `node_type_id` | `int` (autoincrement) | БД | да |
| `name` | `char(64)` `@unique` | seed | да |
| `fk_tool_id` | `int` (FK Tool) | seed (ref `Tool.tool_id`) | да |
| `config_json` | `Json` | seed | да |

### Структура `config_json` (NodeType-Уровень)

```json
{
  "role": "retrieval-source",
  "icon": "BookOpen",
  "input_schema": {},
  "output_schema": {
    "type": "object",
    "required": ["documents", "document_count"],
    "properties": {
      "dataset_id": { "type": ["integer", "null"], "default": null },
      "document_count": { "type": "integer", "minimum": 0 },
      "documents": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["document_id", "uri", "source"],
          "properties": {
            "document_id": { "type": "string" },
            "uri": { "type": "string", "format": "uri" },
            "dataset_id": { "type": ["integer", "null"] },
            "text": { "type": "string" },
            "title": { "type": "string" },
            "source": { "const": "rag-corpus" }
          }
        }
      },
      "documents_manifest": { "type": "object" }
    }
  },
  "node_config_schema": {
    "type": "object",
    "required": ["uris"],
    "properties": {
      "uris": {
        "type": "array",
        "minItems": 1,
        "maxItems": 64,
        "items": {
          "type": "string",
          "pattern": "^workspace://backend/\\.artifacts/rag-corpus/.+\\.(txt|sql|csv)$"
        }
      },
      "description": { "type": "string", "maxLength": 512 }
    }
  }
}
```

### Правила

- `role: 'retrieval-source'` обязательно — нижестоящие метрики `M'_0` (Grounding) полагаются на это значение.
- `input_schema: {}` — узел является source (не принимает данных от родителей).
- `output_schema` точно совпадает с выходом `DocumentLoader` (см. R4 в research.md), плюс ограничение `source: const "rag-corpus"`.
- `node_config_schema` валидируется при `POST /nodes` и `PUT /nodes/:id` через существующий механизм валидации `Node.config_json`.

---

## Сущность 3: `Node.config_json` — Per-Node Конфигурация

**Хранение**: поле `Node.config_json` в существующей таблице `Node`.
**Заполняется**: автором пайплайна через UI или API мутации узла.

### Структура

```json
{
  "uris": [
    "workspace://backend/.artifacts/rag-corpus/proj42/manual.txt",
    "workspace://backend/.artifacts/rag-corpus/proj42/schema.sql",
    "workspace://backend/.artifacts/rag-corpus/proj42/users.csv"
  ],
  "description": "Тестовый корпус для пайплайна QA"
}
```

### Валидация (Hard, При Мутации)

| Условие | Код Ошибки | Сообщение |
|---------|------------|-----------|
| `uris` отсутствует или пуст | `RAG_DATASET_FILE_LIST_EMPTY` | «Узел RAG Dataset должен содержать хотя бы один файл корпуса.» |
| `uris.length > 64` | `RAG_DATASET_FILE_LIST_TOO_LONG` | «Превышен лимит количества файлов в одном узле RAG Dataset (64).» |
| URI не начинается с `workspace://backend/.artifacts/rag-corpus/` | `RAG_DATASET_URI_INVALID` | «URI файла должен ссылаться на управляемое хранилище RAG-корпуса.» |
| URI имеет расширение не из `{txt,sql,csv}` | `RAG_DATASET_FORMAT_INVALID` | «Поддерживаются только форматы txt, sql, csv.» |
| Дубликат URI в списке | `RAG_DATASET_FILE_DUPLICATE` | «Дубликат URI в списке файлов узла RAG Dataset.» |

### Валидация (Hard, При Исполнении)

| Условие | Код Ошибки |
|---------|------------|
| Файл не найден на диске | `RAG_DATASET_FILE_NOT_FOUND` |
| Размер файла > 1 МБ | `RAG_DATASET_SIZE_EXCEEDED` |
| Файл не читается как UTF-8 | `RAG_DATASET_ENCODING_INVALID` |

---

## Сущность 4: Файл Корпуса На Диске

**Хранение**: файловая система, под `<repo_root>/backend/.artifacts/rag-corpus/<project_token>/<filename>`.
**Адресация**: `workspace://backend/.artifacts/rag-corpus/<project_token>/<filename>`.

### Поля (Метаданные)

| Поле | Источник | Обязательно |
|------|----------|-------------|
| `filename` | загрузка пользователя | да |
| `size_bytes` | определяется на диске | да |
| `extension` | вычисляется из `filename` | да |
| `created_at` | время загрузки | да |
| `project_token` | производный токен ownership | да |

### Правила Имени Файла

- Имя файла очищается от опасных символов (`/`, `\`, `..`, etc.) на этапе загрузки.
- Расширение приводится к нижнему регистру.
- При коллизии имени в `<project_token>/` к имени добавляется суффикс `-<hash>`.

### Жизненный Цикл

| Событие | Действие |
|---------|----------|
| Файл загружен через `POST /datasets/upload` (kind=rag-corpus) | записать в `<project_token>/<filename>`, вернуть URI |
| Узел `RAG Dataset` удалён, URI больше нигде не упоминается | (опционально, не в MVP) сборщик мусора удаляет файл |
| Проект удалён | каскадно удаляются файлы в `<project_token>/` |

---

## Связи Между Сущностями

```text
Tool (rag-dataset)
   │ tool_id
   ▼
NodeType (RAGDataset)
   │ node_type_id
   ▼
Node (instance в pipeline)
   │ config_json.uris[]
   ▼
File (workspace://backend/.artifacts/rag-corpus/<project_token>/<filename>)
```

При исполнении узла `Node` контракт `rag-dataset.tool.ts` читает `config_json.uris[]`, резолвит каждый URI в абсолютный путь, проверяет размер и кодировку, читает текст и формирует выход.

---

## State Transitions

Узел `RAG Dataset` не имеет состояний (stateless). Файлы корпуса имеют простой жизненный цикл: `uploaded → in-use → orphaned (если узел удалён) → deleted`.
