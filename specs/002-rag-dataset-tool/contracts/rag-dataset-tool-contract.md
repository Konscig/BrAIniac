# Contract: `rag-dataset` Tool — Phase 1

**Branch**: `002-rag-dataset-tool` | **Date**: 2026-04-30
**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

Контракт исполняемого узла `RAG Dataset` (на стороне backend, в реестре `tool-contract.types.ts`).

---

## Имя И Алиасы

```text
name:    RAGDataset
aliases: ['ragdataset', 'rag-dataset', 'rag_dataset']
```

`name` — каноническое имя в `ToolNode` UI. Алиасы используются при резолве через executor.

---

## Allowed Executors

```text
allowedExecutors: ['http-json']
```

Узел исполняется в Node-процессе через `tool-executor.contract` (тот же путь, что использует `DocumentLoader`). Внешние исполнители (Python sidecar, etc.) не нужны — файлы читаются с локального диска.

---

## Input

Узел `RAG Dataset` — **source-узел**: на вход никаких данных от родительских узлов не принимает (FR-012).

Тем не менее `resolveInput` собирает данные **из контекста узла**, не из upstream-edges:

| Источник | Поле | Обязательно |
|----------|------|-------------|
| `context.config_json` (Node-уровень) | `uris[]` (массив строк) | да, ≥ 1 элемент |
| `context.config_json` | `description` (строка) | нет, для UI/трассировки |

`uris[]` валидируется по правилам из [data-model.md](../data-model.md):

- Каждый URI начинается с `workspace://backend/.artifacts/rag-corpus/`.
- Расширение ∈ `{txt, sql, csv}`.
- Длина массива 1..64.
- Уникальность.

При нарушении хоть одного правила бросается `HttpError(400)` с одним из кодов:
`RAG_DATASET_FILE_LIST_EMPTY` / `RAG_DATASET_FILE_LIST_TOO_LONG` / `RAG_DATASET_URI_INVALID` / `RAG_DATASET_FORMAT_INVALID` / `RAG_DATASET_FILE_DUPLICATE`.

### Pseudocode `resolveInput`

```ts
resolveInput(inputs, context) {
  const cfg = context.config_json ?? {};
  const uris = Array.isArray(cfg.uris) ? cfg.uris : [];

  validateUriList(uris); // bросает HttpError при нарушении

  return { uris };
}
```

`inputs` (upstream edges) **игнорируются** — узел namespace-source.

---

## Output

Drop-in compatible с `DocumentLoader` (FR-011). Полная схема:

```json
{
  "dataset_id": null,
  "document_count": <int>,
  "documents": [
    {
      "document_id": "doc_1",
      "uri": "workspace://backend/.artifacts/rag-corpus/<token>/manual.txt",
      "dataset_id": null,
      "text": "<UTF-8 текст файла>",
      "title": "manual",
      "source": "rag-corpus"
    }
  ],
  "documents_manifest": {
    "kind": "documents",
    "items": [...],
    "metadata": {
      "source": "rag-dataset-contract"
    }
  }
}
```

### Особенности Полей

| Поле | Значение |
|------|----------|
| `dataset_id` | всегда `null` — корпус не привязан к таблице `Dataset`. |
| `document_count` | `documents.length`, неотрицательное. |
| `documents[i].document_id` | производное от `filename` без расширения, sanitized (см. `sanitizeDocumentId` в `DocumentLoader`). |
| `documents[i].uri` | исходный URI из конфига узла (без преобразования). |
| `documents[i].text` | UTF-8 текст файла, нормализованный (`normalizeMultilineText`). |
| `documents[i].title` | имя файла без расширения. |
| `documents[i].source` | литерал `"rag-corpus"`. |
| `documents_manifest` | стандартный inline-манифест через `buildInlineArtifactManifest('documents', documents, { source: 'rag-dataset-contract' })`. |

### Порядок Документов

Сохраняется порядок URI из `config_json.uris[]` (FR-AS#2 в spec).

---

## Errors

Все ошибки — `HttpError(400)` с `code` из набора:

| Код | Условие | `details` |
|-----|---------|-----------|
| `RAG_DATASET_FILE_NOT_FOUND` | файл по URI отсутствует | `{ uri, path }` |
| `RAG_DATASET_SIZE_EXCEEDED` | `size > 1 МБ` | `{ uri, path, size_bytes, limit_bytes: 1048576 }` |
| `RAG_DATASET_ENCODING_INVALID` | файл не декодируется как UTF-8 | `{ uri, path, reason }` |
| `RAG_DATASET_FILE_READ_ERROR` | прочие проблемы чтения (права, IO) | `{ uri, path, reason }` |

`error` — человекочитаемое сообщение на русском (FR-015).

---

## Buffered Reads И Защита По Размеру

`buildHttpSuccessOutput` ДОЛЖЕН проверять размер ДО чтения содержимого:

```ts
const stat = await fs.promises.stat(absolutePath);
if (stat.size > 1_048_576) throw HttpError(400, { code: 'RAG_DATASET_SIZE_EXCEEDED', ... });
```

Это предотвращает OOM на огромных файлах, проскользнувших мимо upload-валидации (например при подмене файла на диске).

---

## ToolContractDefinition (TypeScript Сигнатура)

```ts
export const ragDatasetToolContractDefinition: ToolContractDefinition = {
  name: 'RAGDataset',
  aliases: ['ragdataset', 'rag-dataset', 'rag_dataset'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveRagDatasetContractInput,
  buildHttpSuccessOutput: ({ input }) => buildRagDatasetContractOutput(input),
};
```

Регистрируется в `backend/src/services/application/tool/contracts/index.ts` через `export` и через `resolveToolContractDefinition`.

---

## Совместимость С Существующими Тулами

Узлы, потребляющие выход `RAG Dataset`:

| Tool | Поле | Используется? |
|------|------|---------------|
| Chunker | `documents[]` | да, без изменений |
| Embedder | `documents[]` или `chunks[]` | через Chunker |
| HybridRetriever | `vectors[]` | через цепочку |
| ContextAssembler | `documents[]` | да, без изменений |

Существующий `DocumentLoader` сохраняет свой контракт. Оба тула могут сосуществовать в одном пайплайне.
