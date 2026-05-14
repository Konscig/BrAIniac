---

description: "Task list for RAG Dataset Tool implementation"
---

# Tasks: RAG Dataset Tool

**Input**: Design documents from `/specs/002-rag-dataset-tool/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Test tasks включены — research.md (R9) явно фиксирует 3 уровня тестирования (unit + integration smoke + frontend snapshot), а конституция (принцип III) требует hard-валидации с детерминированными кодами ошибок.

**Organization**: Задачи сгруппированы по user stories из spec.md. US1 и US2 имеют P1 (оба MVP-критичны), US3 — P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Может выполняться параллельно (разные файлы, нет зависимостей)
- **[Story]**: К какой user story принадлежит задача (US1, US2, US3)
- Все пути файлов — от корня репозитория

## Path Conventions

- **Web app monorepo**: `backend/src/`, `frontend/src/`, `docs/sdd/`
- БД-структура НЕ меняется; новые таблицы и миграции отсутствуют (см. plan.md → Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Предварительные шаги, общие для всей фичи.

- [X] T001 Зарезервировать директорию хранилища корпуса: создать `backend/.artifacts/rag-corpus/.gitkeep` и добавить запись в `backend/.gitignore` (игнорировать содержимое, кроме `.gitkeep`) — путь: `backend/.gitignore`, `backend/.artifacts/rag-corpus/.gitkeep`
- [X] T002 [P] Подтвердить, что `Tool` и `NodeType` модели доступны для записи через Prisma (без миграций). Прочитать `backend/prisma/schema.prisma` и проверить, что `Tool`, `NodeType` существуют — нужно убедиться, что новых миграций не потребуется

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Общая инфраструктура, БЕЗ которой невозможно начать ни US1, ни US2.

**⚠️ CRITICAL**: Никакая работа над US1/US2 не начинается до завершения этой фазы.

- [X] T003 Зафиксировать константы лимитов и коды ошибок в `backend/src/services/application/tool/contracts/rag-dataset.constants.ts`: `RAG_DATASET_MAX_FILE_BYTES = 1_048_576`, `RAG_DATASET_MAX_FILES_PER_NODE = 64`, `RAG_DATASET_ALLOWED_EXTENSIONS = ['.txt', '.sql', '.csv']`, `RAG_CORPUS_URI_PREFIX = 'workspace://backend/.artifacts/rag-corpus/'`, и список error code строк (`RAG_DATASET_FILE_LIST_EMPTY`, `RAG_DATASET_FILE_LIST_TOO_LONG`, `RAG_DATASET_URI_INVALID`, `RAG_DATASET_FORMAT_INVALID`, `RAG_DATASET_FILE_DUPLICATE`, `RAG_DATASET_FILE_NOT_FOUND`, `RAG_DATASET_SIZE_EXCEEDED`, `RAG_DATASET_ENCODING_INVALID`, `RAG_DATASET_FILE_READ_ERROR`)
- [X] T004 [P] Утилита определения UTF-8 валидности в `backend/src/common/text/utf8-detector.ts` — функция `isValidUtf8(buffer: Buffer): boolean` (через попытку `Buffer.toString('utf8')` + поиск replacement-символа `U+FFFD`)
- [X] T005 [P] Helper резолва RAG-corpus URI в `backend/src/services/application/dataset/rag-corpus-path.service.ts` — функции `isRagCorpusUri(uri)`, `resolveRagCorpusAbsolutePath(uri)` с защитой от path traversal (по образцу `resolveManagedDatasetAbsolutePath` в `dataset.upload.service.ts`)
- [X] T006 [P] Расширить каталог кодов ошибок в `docs/sdd/04-validation-errors.md`: добавить раздел «RAG Dataset Tool» со списком всех `RAG_DATASET_*` кодов из T003 + русскоязычные сообщения (FR-015)

**Checkpoint**: Foundation готова — US1 и US2 могут идти параллельно.

---

## Phase 3: User Story 1 — Подключение Корпуса Документов К RAG-Пайплайну (Priority: P1) 🎯 MVP

**Goal**: Автор пайплайна может добавить узел `RAG Dataset` в граф, прописать в его конфиге список URI на уже существующие файлы корпуса, и пайплайн при исполнении читает эти файлы и отдаёт документы нижестоящим RAG-тулам.

**Independent Test**: вручную положить тестовый `manual.txt` в `backend/.artifacts/rag-corpus/test/` (имитация ручной загрузки), создать узел `RAGDataset` в пайплайне через API с `config_json.uris = ['workspace://backend/.artifacts/rag-corpus/test/manual.txt']`, соединить с `Chunker`, запустить пайплайн — Chunker должен принять выход без ошибок.

### Tests for User Story 1 ⚠️

> **NOTE: Написать тесты ДО реализации, убедиться что они FAIL.**

- [X] T007 [P] [US1] Smoke-test контракта `rag-dataset` в `backend/scripts/rag-dataset-contract-test.mjs` (по образцу `backend/scripts/rag-artifact-contract-test.mjs`): вызывает `resolveInput` и `buildHttpSuccessOutput` на синтетических вводах, проверяет shape выхода и набор кодов ошибок

### Implementation for User Story 1

- [X] T008 [P] [US1] Реализовать contract `backend/src/services/application/tool/contracts/rag-dataset.tool.ts`: импорт констант из T003, helper из T005, утилита из T004; функции `resolveRagDatasetContractInput(inputs, context)` (читает `context.config_json.uris[]`, валидирует список, возвращает `{ uris }`) и `buildRagDatasetContractOutput({ input })` (читает каждый файл, проверяет размер и кодировку, формирует массив документов с `source: 'rag-corpus'`); экспорт `ragDatasetToolContractDefinition: ToolContractDefinition` с `name: 'RAGDataset'`, aliases, `allowedExecutors: ['http-json']`
- [X] T009 [US1] Зарегистрировать новый контракт в `backend/src/services/application/tool/contracts/index.ts`: добавить `export { ragDatasetToolContractDefinition } from './rag-dataset.tool.js'` и в маппере `resolveToolContractDefinition` добавить ветку для имён/алиасов RAGDataset (зависит от T008)
- [X] T010 [P] [US1] Hard-валидация `Node.config_json` для NodeType=RAGDataset в `backend/src/services/application/node/node.application.service.ts`: добавить функцию-validator (паттерн — inline TS-проверки с `throw new HttpError(400, { code, error, details })`, по образцу существующих проверок в этом же файле, см. строки 21/65/85/104). Использовать константы из T003. Покрыть все 5 правил из data-model.md → «Валидация при мутации»: пустой список, длина >64, неверный URI-префикс, неверное расширение, дубли. Вызывать validator и в `createNode`, и в `updateNode`, когда `node_type.name === 'RAGDataset'`
- [X] T011 [P] [US1] Preflight-валидация `RAGDataset` в `backend/src/services/core/graph_validation.service.ts` (этот файл — реальное место preflight-логики; импортируется из `pipeline.routes.ts`): добавить проверку конфига узлов с типом `RAGDataset` (минимум один URI, отсутствие дублей, валидный префикс/расширение, лимит количества), возврат тех же кодов ошибок что и в T010 — упорядочить ошибки детерминированно по `(node_id, uri_index)` для соответствия принципу III конституции
- [X] T012 [US1] Создать seed-скрипт `backend/prisma/seeds/seed-rag-dataset-tool.mjs`: идемпотентно создать `Tool { name: 'rag-dataset', config_json: {...} }` (см. data-model.md → Сущность 1) и `NodeType { name: 'RAGDataset', fk_tool_id, config_json: {...} }` (см. data-model.md → Сущность 2 с output_schema/node_config_schema); скрипт должен ровно следовать паттерну `seed-tool-contracts.mjs` в части идемпотентности (find → update or create)
- [ ] T013 [US1] **(manual)** Запустить seed на локальной БД: `cd backend && node prisma/seeds/seed-rag-dataset-tool.mjs` — убедиться, что выполнение успешно и идемпотентно (повторный запуск не дублирует записи). Это шаг разработчика, не код-задача
- [X] T014 [US1] Прогнать smoke-test из T007 — он ДОЛЖЕН пройти (`node backend/scripts/rag-dataset-contract-test.mjs` exit code = 0)

**Checkpoint**: К этому моменту US1 полностью функционален и тестируем независимо. Пайплайн с узлом `RAGDataset` собирается и исполняется на ручно положенных файлах. Это уже есть MVP — можно демонстрировать без US2.

---

## Phase 4: User Story 2 — Загрузка Файлов Корпуса Через Управляемое Хранилище (Priority: P1)

**Goal**: Автор пайплайна загружает файл (`txt`/`sql`/`csv` ≤1 МБ) через UI/API, получает стабильный URI и использует его в конфиге узла без ручного копирования файлов на сервер.

**Independent Test**: через `curl` отправить `POST /datasets/upload` с `kind: 'rag-corpus'` — получить URI; сразу затем создать узел `RAGDataset` с этим URI и запустить пайплайн (без манипуляций с файловой системой вручную).

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] Smoke-test endpoint `POST /datasets/upload` с `kind=rag-corpus` в `backend/scripts/rag-corpus-upload-test.mjs`: проверяет happy path (загрузка валидного txt), отказы по размеру/формату/кодировке (возврат правильных codes), последующее чтение файла через resolveRagCorpusAbsolutePath из T005, и **multi-execution reuse (FR-009)**: загрузить файл один раз → дважды выполнить `buildRagDatasetContractOutput` с этим URI → ассертить, что оба прогона возвращают идентичный текст без повторной загрузки

### Implementation for User Story 2

- [X] T016 [P] [US2] Расширить `backend/src/services/application/dataset/dataset.upload.service.ts` ветвью `kind === 'rag-corpus'`: использовать helper из T005, валидировать filename/extension/size/encoding по контракту [contracts/rag-corpus-upload-endpoint.md](./contracts/rag-corpus-upload-endpoint.md); записать файл атомарно (`fs.writeFile` в temp + `rename`); возвратить структуру `{ uri, filename, size_bytes, kind: 'rag-corpus' }`
- [X] T017 [US2] Обновить роут `POST /datasets/upload` в `backend/src/routes/resources/dataset/dataset.routes.ts`: пропустить опциональное поле `kind` в request body, ветвиться на сервис по значению `kind` (default 'golden' = текущая логика; 'rag-corpus' → новая ветка из T016); сохранить frozen-контракт для запросов без `kind` (зависит от T016)
- [X] T018 [P] [US2] Добавить клиентскую функцию `uploadRagCorpus(file: File): Promise<{ uri: string; filename: string; size_bytes: number }>` в `frontend/src/lib/api.ts`: читает файл через `FileReader`, кодирует в base64, делает `postJson('/datasets/upload', { filename, content_base64, kind: 'rag-corpus' })`
- [X] T019 [P] [US2] Создать компонент `frontend/src/components/node-editor/rag-dataset-config.tsx`: пропсы `{ value: { uris: string[] }, onChange(next), disabled? }`; состояние внутри — список URI; кнопка «Загрузить файл» (input `type=file`, `accept=".txt,.sql,.csv"`) → вызывает `uploadRagCorpus` из T018 → новый URI добавляется в конец списка; для каждого URI отображается имя файла, кнопки «вверх»/«вниз» для смены порядка и кнопка удаления. **Drag-and-drop сортировка — post-MVP, в US2 не входит**
- [X] T020 [US2] Подключить `<RagDatasetConfig>` в `frontend/src/components/node-config-dialog.tsx` (это диспетчер per-node config UI; см. там паттерн `normalizeNodeTypeName(nodeType.name)` и условный рендер): добавить ветку для `node_type.name === 'RAGDataset'` (зависит от T019)
- [X] T021 [US2] Прогнать smoke-test из T015 — он ДОЛЖЕН пройти

**Checkpoint**: К этому моменту US1 + US2 работают вместе — полный workflow «загрузить файл через UI → использовать URI в узле → запустить пайплайн».

---

## Phase 5: User Story 3 — Совместимость С Существующими RAG-Тулами (Priority: P2)

**Goal**: Узел `RAG Dataset` является drop-in заменой `DocumentLoader` для существующих RAG-цепочек. Никаких правок нижестоящих тулов не требуется.

**Independent Test**: на демо-пайплайне RAG заменить узел `DocumentLoader` на `RAGDataset` (с теми же файлами), запустить — все нижестоящие узлы (`Chunker`, `Embedder`, `HybridRetriever`, `ContextAssembler`) работают без падений; качество выдачи `LLMAnswer` визуально сопоставимо с baseline.

### Tests for User Story 3 ⚠️

- [ ] T022 [P] [US3] Integration smoke-test полного RAG-пайплайна с `RAGDataset` в `backend/scripts/rag-dataset-pipeline-smoke-test.mjs`: создаёт временный пайплайн `RAGDataset → Chunker → Embedder → VectorUpsert` через API, выполняет `POST /pipelines/:id/execute`, polling до `succeeded`, ассертит наличие чанков в выходе

### Implementation for User Story 3

- [ ] T023 [US3] Подготовить демо-сценарий: написать (или расширить существующий) seed-скрипт `backend/prisma/seeds/seed-rag-dataset-demo.mjs`, создающий пайплайн с цепочкой `RAGDataset → Chunker → Embedder → VectorUpsert` для одного-двух тестовых документов; идемпотентен; полезен для quickstart.md и студенческого онбординга
- [ ] T024 [US3] Прогнать smoke-test T022 — он ДОЛЖЕН пройти, выход цепочки содержит ожидаемое число чанков
- [X] T025 [P] [US3] Дополнить `docs/sdd/08-rag-toolkit.md`: добавить раздел «RAG Dataset Tool» как рекомендуемый источник корпуса для новых пайплайнов; пометить `DocumentLoader` как сохраняемый для обратной совместимости (no deprecation timeline yet)

**Checkpoint**: К этому моменту все три user stories функциональны независимо. Существующие пайплайны на `DocumentLoader` продолжают работать.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Финальные штрихи, документация, freeze-тесты, проверка SC.

- [ ] T026 [P] Snapshot-тест UI-компонента `<RagDatasetConfig>` в `frontend/src/components/node-editor/__tests__/rag-dataset-config.test.tsx` — рендер с пустым `uris`, рендер с тремя URI, эмуляция выбора файла (мок `uploadRagCorpus`)
- [ ] T027 Запустить полный набор freeze-тестов backend: `npm --prefix backend run test:contracts:freeze && npm --prefix backend run test:executor:http && npm --prefix backend run test:executor:coordination` — все ДОЛЖНЫ пройти (фича аддитивна, frozen-контракты не затронуты)
- [ ] T028 Прогнать сценарий из [quickstart.md](./quickstart.md) end-to-end на dev-окружении: 7 шагов, все критерии приёмки SC-001..SC-005 ДОЛЖНЫ выполняться
- [ ] T029 [P] Обновить `README.md` (если в нём есть раздел RAG): добавить упоминание `RAG Dataset` как способа подключения корпуса
- [ ] T030 Финальный self-review: пройтись по `Constitution Check` в [plan.md](./plan.md) и убедиться, что ни один принцип I..VII не нарушен в финальной реализации; выложить PR с описанием по образцу 001-ai-judge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001-T002 — могут начинаться сразу.
- **Foundational (Phase 2)**: T003-T006 — БЛОКИРУЮТ начало US1 и US2. T003 — линейная (ставит общие константы), T004/T005/T006 — параллельны после T003.
- **US1 (Phase 3)**: T007-T014 — зависят от Foundational.
- **US2 (Phase 4)**: T015-T021 — зависят от Foundational, могут идти параллельно с US1 (разные файлы, разные ответственности).
- **US3 (Phase 5)**: T022-T025 — зависят от US1 и US2 (нужен и узел, и upload-флоу для демо-пайплайна).
- **Polish (Phase 6)**: T026-T030 — зависят от US1+US2+US3 (T026 от US2; T027/T028 от всего комплекса).

### Within Each User Story

- **US1**: T007 (test) → T008 (contract impl) → T009 (registration) → T010+T011 (validation, parallel) → T012 (seed) → T013 (run seed) → T014 (run test).
- **US2**: T015 (test) → T016 (service) → T017 (route) → T018 (api client) → T019 (component) → T020 (wire-up) → T021 (run test).
- **US3**: T022 (test) → T023 (demo seed) → T024 (run test) → T025 (docs).

### Parallel Opportunities

- T002 параллелен T001 (только проверка).
- В Phase 2: T004, T005, T006 — все [P] после T003.
- В US1: T007 (test) || T008 (impl) — TDD-режим. T010, T011 — оба [P] (разные файлы).
- В US2: T015 (test) || T016, T018, T019 — независимы.
- В US3: T022 (test) || T023 (seed).
- В Polish: T026, T029 — параллельны.

### Параллельный Прогон (Командой)

После завершения Phase 2 (Foundational) разработчик A может полностью взять Phase 3 (US1), разработчик B — Phase 4 (US2). Они почти не пересекаются по файлам:

- US1 трогает: `tool/contracts/rag-dataset.tool.ts`, `tool/contracts/index.ts`, `node/node.application.service.ts`, `pipeline/pipeline.preflight.service.ts`, новый seed.
- US2 трогает: `dataset/dataset.upload.service.ts`, `routes/resources/dataset/dataset.routes.ts`, `frontend/src/lib/api.ts`, новый компонент.

Единственная косвенная зависимость: US3 (демо-пайплайн) предполагает, что `seed-rag-dataset-tool.mjs` (T012 из US1) уже выполнен. Если US1 не закончен, US3 ждёт.

---

## Implementation Strategy

### MVP First (US1 Only)

1. Phase 1: Setup (T001-T002).
2. Phase 2: Foundational (T003-T006).
3. Phase 3: US1 (T007-T014).
4. **STOP & VALIDATE**: Положить тестовый `manual.txt` руками в `backend/.artifacts/rag-corpus/test/`, создать пайплайн через API, прогнать — drop-in замена `DocumentLoader` уже работает. Это и есть MVP.
5. Демо/деплой по желанию.

### Incremental Delivery

1. MVP (US1) → STOP & VALIDATE → выложить.
2. + US2 (управляемая загрузка через UI) → STOP & VALIDATE → выложить.
3. + US3 (compatibility shake-out + docs) → STOP & VALIDATE → выложить.
4. Polish (T026-T030) → freeze-тесты, quickstart, PR.

Каждый инкремент добавляет ценность, не ломая предыдущий.

---

## Notes

- [P] = разные файлы, нет зависимостей.
- [Story] метки маппят таски на user stories для трассируемости.
- T013 (запуск seed) и T024 (запуск integration smoke) можно объединить в финальный prepare-shell, если использовать make-target.
- BPM: после каждой подгруппы (Phase) — коммит. Внутри US1: коммит после T009, T012, T014. Внутри US2: коммит после T017, T020, T021.
- Freeze-тесты (T027) — обязательны перед merge в `main` согласно конституции (раздел «Процесс Разработки И Контрольные Ворота»).
- Никаких миграций Prisma фича не вводит. БД-схема `Tool`, `NodeType`, `Node.config_json` уже существует.
