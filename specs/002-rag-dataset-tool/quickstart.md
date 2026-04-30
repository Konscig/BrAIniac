# Quickstart: RAG Dataset Tool — Phase 1

**Branch**: `002-rag-dataset-tool` | **Date**: 2026-04-30
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Минимальный сценарий проверки фичи end-to-end. Работает после раскатки реализации.

---

## Предусловия

1. Backend запущен (`cd backend && npm run dev` или `docker compose up -d`).
2. БД доступна, миграции применены, сиды загружены:
   ```bash
   cd backend
   npx prisma migrate deploy
   node prisma/seeds/seed-basic-node-types.mjs
   node prisma/seeds/seed-tool-contracts.mjs
   node prisma/seeds/seed-rag-dataset-tool.mjs   # <— новый сид этой фичи
   ```
3. Frontend запущен (`cd frontend && npm start`) и доступен на `http://localhost:3001`.
4. Учётка пользователя создана и есть валидный JWT-токен (см. login flow).

---

## Шаг 1. Загрузка Файла Корпуса

Подготовить тестовый файл `manual.txt` (≤ 1 МБ, UTF-8):

```text
# Руководство пользователя
Глава 1. Установка...
Глава 2. Конфигурация...
```

Закодировать в base64:

```bash
base64 -i manual.txt -o manual.b64
TOKEN=<JWT>
```

Загрузить:

```bash
curl -X POST http://localhost:3000/datasets/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"manual.txt\",
    \"content_base64\": \"$(cat manual.b64)\",
    \"kind\": \"rag-corpus\"
  }"
```

Ожидаемый ответ:

```json
{
  "uri": "workspace://backend/.artifacts/rag-corpus/user_1/manual.txt",
  "filename": "manual.txt",
  "size_bytes": 1234,
  "kind": "rag-corpus"
}
```

**Чек**: файл должен лежать на диске в `backend/.artifacts/rag-corpus/user_1/manual.txt`.

---

## Шаг 2. Проверка Отказа Загрузки При Нарушениях

### 2.1. Файл слишком большой

```bash
dd if=/dev/urandom of=huge.bin bs=1M count=2
base64 -i huge.bin -o huge.b64
curl -X POST http://localhost:3000/datasets/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"huge.txt\",
    \"content_base64\": \"$(cat huge.b64)\",
    \"kind\": \"rag-corpus\"
  }"
```

Ожидается: `413 Payload Too Large`, `code: RAG_DATASET_SIZE_EXCEEDED`. Файл на диск не записывается.

### 2.2. Неподдерживаемый формат

```bash
curl -X POST http://localhost:3000/datasets/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"x.pdf","content_base64":"AAA","kind":"rag-corpus"}'
```

Ожидается: `400`, `code: RAG_DATASET_FORMAT_INVALID`.

### 2.3. Бинарный контент в .txt

```bash
base64 -i /bin/ls -o binary.b64
curl -X POST http://localhost:3000/datasets/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"binary.txt\",
    \"content_base64\": \"$(cat binary.b64)\",
    \"kind\": \"rag-corpus\"
  }"
```

Ожидается: `400`, `code: RAG_DATASET_ENCODING_INVALID`.

---

## Шаг 3. Создание Пайплайна С Узлом RAG Dataset

Через UI (рекомендуемый путь):

1. Открыть `http://localhost:3001`, залогиниться.
2. Создать новый пайплайн в проекте.
3. Из палитры узлов перетащить «RAG Dataset» на канву.
4. В правой панели конфига узла нажать «Загрузить файл», выбрать `manual.txt`.
5. URI автоматически добавляется в список `uris`.
6. Соединить узел с `Chunker → Embedder → VectorUpsert`.
7. Нажать «Сохранить» — пайплайн валидируется без ошибок.

Через API:

```bash
curl -X POST http://localhost:3000/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fk_pipeline_id": 1,
    "fk_node_type_id": <id_RAGDataset>,
    "name": "Corpus",
    "position_x": 100,
    "position_y": 100,
    "config_json": {
      "uris": ["workspace://backend/.artifacts/rag-corpus/user_1/manual.txt"]
    }
  }'
```

---

## Шаг 4. Проверка Preflight Валидации

```bash
curl -X POST http://localhost:3000/pipelines/1/validate-graph \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"preset":"default"}'
```

Ожидается: `errors: []`, `warnings: []` если граф корректен.

Проверка отказа preflight: попробовать создать узел с пустым `uris: []`. Ожидается `400`, `code: RAG_DATASET_FILE_LIST_EMPTY`.

---

## Шаг 5. Запуск Пайплайна

```bash
curl -X POST http://localhost:3000/pipelines/1/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"input":{}}'
```

Ожидается `202 Accepted` с `execution_id`. Polling через `GET /pipelines/1/executions/<execution_id>`.

После `status: succeeded`:

- В выходе узла `RAG Dataset` (через `summary.nodes` или `node.output_json`) присутствует массив `documents` длины 1, с полем `text`, содержащим контент `manual.txt`.
- Узел `Chunker` принимает выход и порождает чанки.

---

## Шаг 6. Сосуществование С Golden Dataset

Параллельно с `RAG Dataset` создать на том же пайплайне `Dataset` (golden) через `POST /datasets/upload` с `kind: 'golden'` (или без `kind`):

```bash
curl -X POST http://localhost:3000/datasets/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename":"gold.jsonl",
    "content_base64":"<base64_of_jsonl>",
    "fk_pipeline_id": 1
  }'
```

Запустить ИИ-судью:

```bash
curl -X POST http://localhost:3000/judge/assessments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":1, "items":[ ... ]}'
```

**Чек**: судья читает только golden dataset (`Dataset` table), корпус узла `RAG Dataset` НЕ попадает в эталонные пары.

---

## Шаг 7. Smoke-Тест Контракта

```bash
cd backend
node scripts/rag-dataset-contract-test.mjs
```

Проверяет:

- `resolveInput` корректно парсит `config_json.uris`.
- `buildHttpSuccessOutput` читает файл и формирует выход с правильной schema.
- Ошибки маппятся на правильные коды.

Скрипт ДОЛЖЕН выходить с кодом 0 при успехе.

---

## Критерии Приёмки

После прохождения шагов 1–7 без ошибок:

- ✅ SC-001: Пайплайн собирается и запускается без правок БД (через UI/API за < 5 минут).
- ✅ SC-002: Файлы > 1 МБ или с запрещённым расширением гарантированно отклоняются.
- ✅ SC-003: Судья работает только с golden, корпус остаётся в стороне.
- ✅ SC-004: Drop-in замена `DocumentLoader` на `RAG Dataset` не ломает нижестоящие узлы.
- ✅ SC-005: Каталог тулов в UI отображает «RAG Dataset» сразу после сидинга.

Если любой шаг падает — фича не готова к приёмке. Логи backend (`docker compose logs backend` или вывод `npm run dev`) показывают точную причину через `code` ошибки.
