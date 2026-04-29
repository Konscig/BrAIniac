# Research: RAG Dataset Tool — Phase 0 Outline

**Branch**: `002-rag-dataset-tool` | **Date**: 2026-04-30
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Все нерешённые вопросы технического контекста плана разрешены ниже. Каждое решение оформлено как Decision Record (Decision / Rationale / Alternatives).

---

## R1. Где Хранить Файлы Корпуса На Диске

**Decision**: использовать **отдельный workspace-префикс** `workspace://backend/.artifacts/rag-corpus/` (параллельно существующему `workspace://backend/.artifacts/datasets/`).

**Rationale**:
- Семантическое разделение: `datasets/` = golden datasets ИИ-Судьи (taggable per-pipeline через таблицу `Dataset`), `rag-corpus/` = сырые документы корпуса (адресуемые только через URI в `Node.config_json`).
- Разная политика очистки: golden datasets обычно версионируются и хранятся долго; rag-corpus может чиститься при удалении пайплайна без побочных эффектов на оценку.
- Отдельный префикс упрощает аудит и обнаружение «выкинутых» файлов: достаточно сравнить файлы в `rag-corpus/` с URI в `Node.config_json` всех узлов `RAG Dataset`.
- Существующий `DocumentLoader` принимает любой `workspace://...` URI, поэтому новый префикс автоматически совместим с ним (без правок).

**Alternatives considered**:
- Класть в `workspace://backend/.artifacts/datasets/` вместе с golden — отвергнуто: смешивает две сущности с разными жизненными циклами и нарушает разделение ответственности, ради которого фича и затевается.
- Положить рядом с самим пайплайном (`.artifacts/pipelines/<id>/corpus/`) — отвергнуто: дублирует хранение, если один и тот же файл используется в нескольких пайплайнах одного проекта.

---

## R2. Расширение Эндпоинта Загрузки Или Новый

**Decision**: расширить существующий `POST /datasets/upload` параметром `kind` со значениями `golden` (default, для совместимости) и `rag-corpus`. В зависимости от `kind` выбирается префикс хранения и набор валидаций.

**Rationale**:
- Минимизирует поверхность API: один эндпоинт с явным дискриминатором понятнее, чем два почти одинаковых.
- Существующий формат payload (`filename`, `content_base64`) подходит как есть.
- Параметр `kind` явно отделяет валидации (для golden — JSONL/JSON/.md/.txt; для rag-corpus — только `.txt`/`.sql`/`.csv` ≤ 1 МБ).
- Backward-compatible: запросы без `kind` ведут себя как раньше (golden).

**Alternatives considered**:
- Отдельный эндпоинт `POST /rag-corpus/upload` — отвергнуто: дублирует validate/auth/error-handling код, увеличивает поверхность контракта. Frozen-контракт `POST /datasets/upload` не нарушается, потому что новый параметр — опциональный.
- Параметр в URL (`POST /datasets/upload?kind=rag-corpus`) — отвергнуто: query-параметр для семантического выбора kind хуже читается, чем поле в body, и сложнее логируется.

---

## R3. Валидация Размера И Расширения

**Decision**: проверка ведётся **в трёх точках**:

1. **Загрузка** — в `dataset.upload.service.ts` (новая ветка `kind === 'rag-corpus'`): проверка `extension ∈ {txt, sql, csv}` и `size ≤ 1 МБ` ДО записи на диск.
2. **Mutation узла** (`POST /nodes`, `PUT /nodes/:id`) — валидация `config_json.uris[]`: каждый URI должен начинаться с `workspace://backend/.artifacts/rag-corpus/`, и проверка количества (≤ 64) и отсутствие дублей.
3. **Исполнение узла** (`rag-dataset.tool.ts`): дополнительная проверка размера файла в момент чтения (защита от подмены файла после загрузки).

**Rationale**:
- Принцип III конституции (Валидация При Мутации) требует hard-валидации на этапе записи. Проверка только при исполнении нарушает principle и приводит к "проходящим" графам.
- Размер на этапе исполнения — защита от race condition, когда файл был перезаписан в хранилище после загрузки (см. assumption в spec).
- Расширение проверяется по `path.extname().toLowerCase()`, без MIME-sniffing'а на этапе загрузки (упрощение для MVP).

**Alternatives considered**:
- Валидация только при загрузке — отвергнуто: не покрывает случай ручной правки `config_json` в обход UI или замены файла на диске.
- Полный MIME-sniffing (использование `file-type` пакета) — отвергнуто: добавляет зависимость и сложность; для текстовых форматов достаточно проверки расширения + попытки прочитать файл как UTF-8.

---

## R4. Контракт Выхода Узла `RAG Dataset`

**Decision**: точное совпадение с выходным контрактом `DocumentLoader`:

```json
{
  "dataset_id": null,
  "document_count": 3,
  "documents": [
    { "document_id": "doc_1", "uri": "workspace://...", "dataset_id": null, "text": "...", "title": "...", "source": "rag-corpus" }
  ],
  "documents_manifest": { ... }
}
```

Отличие — `source: 'rag-corpus'` (новое значение литерала источника, добавляемое в union DocumentLoader).

**Rationale**:
- FR-011 в спеке требует drop-in совместимости с `DocumentLoader`.
- Поле `dataset_id` остаётся `null` — корпус не привязан к таблице `Dataset`, и нижестоящие тулы не должны полагаться на это поле.
- Поле `source` помогает отличать запись в trace и метриках наблюдаемости.

**Alternatives considered**:
- Свой собственный shape (`corpus_documents` вместо `documents`) — отвергнуто: ломает совместимость, требует адаптеров перед каждым нижестоящим тулом.

---

## R5. Регистрация Тула И NodeType В Каталоге

**Decision**: новый seed-скрипт `backend/prisma/seeds/seed-rag-dataset-tool.mjs`, идемпотентный, использует существующий паттерн (см. `seed-tool-contracts.mjs`). Регистрирует:

- `Tool { name: 'rag-dataset', config_json: { description, supported_formats, max_file_size_bytes, max_files_per_node, output_schema_version } }`
- `NodeType { name: 'RAGDataset', tool_id, config_json: { role: 'retrieval-source', input_schema: {}, output_schema: { ... } } }`

**Rationale**:
- Сидинг через скрипт — единственный путь, не требующий миграции схемы. БД-структура не меняется.
- Идемпотентность через `findFirst → update or create` (существующий паттерн) позволяет безопасно перезапускать на dev-машине.
- `NodeType.role: 'retrieval-source'` — переиспользует существующее значение, чтобы попасть в подмножество метрик `M'_0` ИИ-Судьи без изменений принципа V.

**Alternatives considered**:
- Создавать запись через UI — отвергнуто: требует ручного шага для каждой среды (dev/CI/prod), не воспроизводимо.
- Через миграцию Prisma — отвергнуто: данные каталога не относятся к схеме, миграция — неподходящий инструмент.

---

## R6. UI Загрузки Файлов И Подбора URI

**Decision**: на фронте — новый компонент `<RagDatasetConfig>` (отдельный, не общий с golden datasets), с двумя секциями:

1. **Загрузка файла** — инпут `<input type="file" accept=".txt,.sql,.csv">`, при выборе клиент отправляет `POST /datasets/upload` (с `kind: 'rag-corpus'`) и получает URI.
2. **Список URI узла** — отображение `config_json.uris`, drag-and-drop сортировка, кнопка удаления.

Загруженный URI автоматически добавляется в конец списка.

**Rationale**:
- Существующий `DatasetUploadModal` ориентирован на golden datasets (JSONL preview, schema validation) и не подходит как есть.
- Отдельный компонент проще тестировать и эволюционировать (например, добавить превью первых 200 байт файла).
- Drag-and-drop сортировка нужна, потому что порядок документов в выходе сохраняется (см. AS#2 в спеке).

**Alternatives considered**:
- Расширить `DatasetUploadModal` параметром `kind` — отвергнуто: сложно поддерживать два режима в одном компоненте; UX-валидация JSONL не нужна для rag-corpus.
- Только текстовое поле для URI без загрузки — отвергнуто: ломает Story 2 (управляемая загрузка).

---

## R7. Что Делать С Существующим `DocumentLoader`

**Decision**: оставить `DocumentLoader` в каталоге без изменений на текущем этапе. Документировать в `docs/sdd/08-rag-toolkit.md` рекомендацию использовать `RAG Dataset` для новых пайплайнов; deprecation `DocumentLoader` — отдельной фичей в будущем.

**Rationale**:
- Существующие пайплайны (включая демо-пайплайны студентов) могут использовать `DocumentLoader`. Удаление сломает SC-005 (бутстрап без ручного шага).
- Параллельное существование двух инструментов с пересекающейся функциональностью допустимо в учебной среде: отличие в источнике файлов (`DocumentLoader` — табличный `Dataset`, `RAG Dataset` — отдельный workspace-префикс) даёт студенту обучающий контекст.

**Alternatives considered**:
- Удалить `DocumentLoader` сразу — отвергнуто: ломает обратную совместимость и нарушает FR-016, FR-017.
- Переименовать `DocumentLoader` в `RAG Dataset` — отвергнуто: меняет публичный контракт каталога, ломает экспортированный код.

---

## R8. Чтение Файла И Кодировка

**Decision**: чтение через `readFile(absolutePath, 'utf8')`. Если файл не декодируется как UTF-8 (содержит invalid-байты, выявляется через попытку `Buffer.toString('utf8')` + `.indexOf('�')`), запрос отклоняется с кодом `RAG_DATASET_ENCODING_INVALID`.

**Rationale**:
- UTF-8 — фактический стандарт для txt/sql/csv в современных системах.
- Поддержка cp1251/koi8-r выходит за рамки MVP (assumption в спеке).
- Detection через replacement character `U+FFFD` — простой, без зависимостей.

**Alternatives considered**:
- Использовать `chardet`-подобную автодетекцию — отвергнуто: добавляет зависимость, не нужно для MVP.
- Хранить файлы как base64 в БД — отвергнуто: противоречит существующему паттерну workspace, увеличивает размер БД.

---

## R9. Тестирование

**Decision**: три уровня тестов:

1. **Unit**: `backend/scripts/rag-dataset-contract-test.mjs` (по образцу `rag-artifact-contract-test.mjs`) — проверяет shape выхода контракта на синтетических вводах.
2. **Integration**: smoke-test, поднимающий минимальный пайплайн `RAG Dataset → Chunker` через `/pipelines/:id/execute`, ассертит количество чанков.
3. **Frontend snapshot**: компонент `<RagDatasetConfig>` рендерится с моковыми пропсами, состояние после загрузки файла верно.

**Rationale**:
- Существующие test-скрипты в `backend/scripts/` — главный механизм тестирования бэкенда; следуем паттерну.
- Frontend юнит-тесты в проекте есть, но используются ограниченно; для MVP достаточно snapshot-теста ключевого компонента.

**Alternatives considered**:
- Полный e2e через playwright — отвергнуто: излишне для одной фичи, инфраструктуры e2e в проекте пока нет.

---

## Сводка Решений

| ID | Тема | Решение |
|----|------|---------|
| R1 | Хранение файлов | Префикс `workspace://backend/.artifacts/rag-corpus/` |
| R2 | Endpoint | Расширить `POST /datasets/upload` параметром `kind: 'rag-corpus'` |
| R3 | Валидация | 3 точки: upload + mutation + execution |
| R4 | Output schema | Совпадение с `DocumentLoader`, `source: 'rag-corpus'` |
| R5 | Регистрация в каталоге | Идемпотентный seed-скрипт |
| R6 | UI | Отдельный компонент `<RagDatasetConfig>` |
| R7 | DocumentLoader | Оставить как есть, не deprecate |
| R8 | Кодировка | UTF-8, detection через replacement char |
| R9 | Тесты | Unit + integration smoke + frontend snapshot |

Все NEEDS CLARIFICATION технического контекста разрешены. Готовность к Phase 1 (Design & Contracts).
