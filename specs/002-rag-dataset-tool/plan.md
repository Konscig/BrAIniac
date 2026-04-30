# Implementation Plan: RAG Dataset Tool

**Branch**: `002-rag-dataset-tool` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-rag-dataset-tool/spec.md`

## Summary

Добавить в каталог тулов BrAIniac новую запись `rag-dataset` и одноимённый `NodeType`, через который автор пайплайна подключает корпус документов (`txt`/`sql`/`csv`, ≤1 МБ каждый) для RAG-агента. Файлы хранятся в управляемом workspace-хранилище под отдельным префиксом `workspace://backend/.artifacts/rag-corpus/`, чтобы развести семантику с существующим `Dataset` (golden datasets для ИИ-Судьи). Контракт выхода узла совпадает с `DocumentLoader` (drop-in replacement), что обеспечивает работу с существующими RAG-тулами `Chunker`, `Embedder`, `HybridRetriever`, `ContextAssembler` без миграции графов.

Технически фича реализуется как (а) новый contract `rag-dataset.tool.ts` рядом с существующими в `backend/src/services/application/tool/contracts/`, (б) новый upload-endpoint `POST /datasets/upload-rag-corpus` (или расширение существующего `POST /datasets/upload` с параметром `kind: 'rag-corpus'`), (в) seed-скрипт `seed-rag-dataset-tool.mjs`, регистрирующий `Tool` и `NodeType` в каталоге, (г) UI-кнопка загрузки корпуса в редакторе узла на фронте.

## Technical Context

**Language/Version**: TypeScript 5.x (backend, ES2022, ESM), TypeScript 5.x (frontend, CRA + React 19)
**Primary Dependencies**: Express 5, Prisma 6 (Postgres), `react-scripts` 5 (CRA), уже подключённая инфраструктура `tool-contract.types.ts` / `tool-artifact.manifest.ts`
**Storage**: Postgres для каталога (`Tool`, `NodeType`, `Node.config_json`); локальная файловая система под workspace root (`backend/.artifacts/rag-corpus/`) для текстов корпуса
**Testing**: существующие test-скрипты в `backend/scripts/` (`test:contracts:freeze`, `test:executor:http`); новый smoke-test для контракта `rag-dataset` через `tool-executor`
**Target Platform**: Linux/macOS dev-машина, Docker compose для деплоя; node 20-alpine в контейнере backend
**Project Type**: web-application (backend + frontend monorepo)
**Performance Goals**: формальные SLO не вводятся для MVP; ожидание — чтение корпуса и preflight выполняются «мгновенно» по UX-меркам (без явных бенчмарков). Если в будущем появятся регрессии — добавлять в `quickstart.md` step с замером.
**Constraints**: размер одного файла ≤ 1 МБ (1 048 576 байт); количество файлов в одном узле ≤ 64; только текстовые форматы `.txt` / `.sql` / `.csv`; URI допускается только `workspace://backend/.artifacts/rag-corpus/...`
**Scale/Scope**: учебный проект; ожидаемые объёмы — десятки пайплайнов на студента, в каждом до 64 файлов корпуса. Никаких распределённых хранилищ, репликации или CDN.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Двухуровневая Согласованность Графа — ✅ PASS

Узел `RAG Dataset` живёт исключительно на Уровне 1 (модель данных + канва). Он не выполняет никаких внутренних tool-call циклов и не порождает скрытой топологии. Loop-policy неприменима (узел — `source` без входов).

### II. Канонический Edge-Only Контракт Инструментов — ✅ PASS

Узел `RAG Dataset` — **источник документов** в графовой цепочке RAG, аналогичный по роли `DocumentLoader`. Он НЕ предоставляет инструмент для `AgentCall`. Канонический путь `ToolNode -> AgentCall` не задействуется — узел общается с нижестоящими тулами через обычные исходящие рёбра графа. Запретов конституции по этому принципу не нарушает.

### III. Валидация При Мутации И Детерминированный Preflight (NON-NEGOTIABLE) — ✅ PASS

В feature SPEC уже зафиксированы правила preflight (FR-013, FR-014):

- Формат файла, размер, расширение, дубли URI — проверяются и при мутации `Node.config_json`, и в preflight `POST /pipelines/:id/validate-graph`.
- Коды ошибок добавляются в каталог `docs/sdd/04-validation-errors.md` (новые: `RAG_DATASET_FORMAT_INVALID`, `RAG_DATASET_SIZE_EXCEEDED`, `RAG_DATASET_URI_INVALID`, `RAG_DATASET_FILE_LIST_EMPTY`, `RAG_DATASET_FILE_DUPLICATE`).
- Preflight-ответ остаётся бит-в-бит детерминированным: список ошибок упорядочивается по `(node_id, uri_index)`.

### IV. Ограниченное Исполнение (Bounded Execution) — ✅ PASS

Узел `RAG Dataset` не содержит циклов и не интегрирован с `AgentCall`. Бюджеты исполнения (`maxAttempts`, `maxToolCalls`) к нему не применяются. Тем не менее **ограничение количества файлов (≤64) и размера каждого (≤1 МБ)** играет роль bounded-input гарантии: чтение корпуса всегда ограничено сверху по времени и памяти.

### V. Оценка Через Взвешенные Нормированные Метрики — ✅ PASS

Фича не вводит новых метрик для ИИ-Судьи. Существующие метрики, оперирующие узлами с ролью «retrieval source», работают с `RAG Dataset` так же, как с `DocumentLoader` (по `node_role`). `M'_0` baseline не требует пересчёта.

### VI. Стабильность Публичного Контракта — ✅ PASS

Замороженные контракты (`AgentCall.ui_json`, `ToolNode.ui_json`, `POST /datasets/upload`, `POST /pipelines/:id/execute`, `GET /pipelines/:id/executions/:executionId`) **не изменяются**. Новый эндпоинт `POST /datasets/upload-rag-corpus` (или вариант с параметром `kind`) добавляется аддитивно. Существующий `DocumentLoader` сохраняется. Migration notes не требуются.

### VII. Воспроизводимость И Наблюдаемость — ✅ PASS

При исполнении узла записывается `documents_manifest` с информацией о каждом загруженном файле (URI, hash, размер, кодировка). Эта инфа попадает в `tool_call_trace` нижестоящих узлов через стандартный механизм `buildInlineArtifactManifest`. Idempotency для self-replay работает через существующий заголовок `x-idempotency-key` пайплайн-исполнения.

**Conclusion**: Все гейты конституции пройдены без отступлений. Раздел `Complexity Tracking` пуст.

## Project Structure

### Documentation (this feature)

```text
specs/002-rag-dataset-tool/
├── plan.md                # This file (/speckit.plan command output)
├── spec.md                # /speckit.specify output
├── research.md            # Phase 0 output (/speckit.plan command)
├── data-model.md          # Phase 1 output (/speckit.plan command)
├── quickstart.md          # Phase 1 output (/speckit.plan command)
├── contracts/             # Phase 1 output (/speckit.plan command)
│   ├── rag-dataset-tool-contract.md     # contract definition + I/O schema
│   └── rag-corpus-upload-endpoint.md    # HTTP endpoint contract
├── checklists/
│   └── requirements.md    # /speckit.specify quality checklist
└── tasks.md               # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── services/
│   │   ├── application/
│   │   │   ├── tool/
│   │   │   │   └── contracts/
│   │   │   │       ├── rag-dataset.tool.ts         # NEW — contract impl
│   │   │   │       └── index.ts                    # update: export ragDatasetToolContractDefinition
│   │   │   └── dataset/
│   │   │       ├── dataset.upload.service.ts       # extend: support rag-corpus subdir + size/format guard
│   │   │       └── rag-corpus.upload.service.ts    # NEW (optional) — separate guard for clarity
│   │   └── pipeline/
│   │       └── pipeline.preflight.service.ts       # extend: validate rag-dataset config
│   └── routes/
│       └── resources/
│           └── dataset/
│               └── dataset.routes.ts               # extend: add POST /datasets/upload-rag-corpus or kind param
└── prisma/
    └── seeds/
        └── seed-rag-dataset-tool.mjs               # NEW — register Tool + NodeType in catalog

frontend/
├── src/
│   ├── components/
│   │   ├── node-editor/
│   │   │   └── rag-dataset-config.tsx              # NEW — editor for per-node URI list with file picker
│   │   └── (existing tool palette auto-renders new NodeType)
│   └── lib/
│       └── api.ts                                  # extend: uploadRagCorpus(file) → workspace URI

docs/
└── sdd/
    └── 04-validation-errors.md                     # extend: new RAG_DATASET_* codes
```

**Structure Decision**: используется существующая monorepo-структура (Option 2 web application). Новые файлы идут в существующие пакеты `backend/`, `frontend/`, `docs/sdd/`. БД-схема НЕ меняется (никаких новых таблиц или миграций) — фича реализуется на уже существующих моделях `Tool`, `NodeType`, `Node.config_json` и в файловой системе `backend/.artifacts/rag-corpus/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Раздел пуст — все гейты конституции пройдены, отступлений нет.
