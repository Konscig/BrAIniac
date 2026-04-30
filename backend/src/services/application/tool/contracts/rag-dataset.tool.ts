/**
 * Контракт тула RAG Dataset.
 *
 * Source-узел: читает корпус документов из управляемого хранилища
 * (`workspace://backend/.artifacts/rag-corpus/...`) и отдаёт массив документов
 * в формате, совместимом с `DocumentLoader` (drop-in replacement).
 *
 * См. specs/002-rag-dataset-tool/contracts/rag-dataset-tool-contract.md.
 */

import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../../../../common/http-error.js';
import { isValidUtf8 } from '../../../../common/text/utf8-detector.js';
import {
  resolveRagCorpusAbsolutePath,
} from '../../dataset/rag-corpus-path.service.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import { buildInlineArtifactManifest } from './tool-artifact.manifest.js';
import type { ToolContractDefinition } from './tool-contract.types.js';
import {
  RAG_CORPUS_DOCUMENT_SOURCE,
  RAG_CORPUS_URI_PREFIX,
  RAG_DATASET_ALLOWED_EXTENSIONS,
  RAG_DATASET_ERROR_CODES,
  RAG_DATASET_ERROR_MESSAGES,
  RAG_DATASET_MAX_FILE_BYTES,
  RAG_DATASET_MAX_FILES_PER_NODE,
  RAG_DATASET_NODE_TYPE_NAME,
} from './rag-dataset.constants.js';

type LoadedDocument = {
  document_id: string;
  uri: string;
  dataset_id: number | null;
  text: string;
  title: string;
  source: typeof RAG_CORPUS_DOCUMENT_SOURCE;
};

type RagDatasetResolvedInput = { uris: string[] };

const ALLOWED_EXTENSIONS_SET = new Set<string>(RAG_DATASET_ALLOWED_EXTENSIONS);

function sanitizeDocumentId(raw: string): string {
  const compact = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return compact.length > 0 ? compact.slice(0, 120) : 'doc';
}

function inferTitleFromUri(uri: string): string {
  const tail = uri.split('/').pop() ?? uri;
  const parsed = path.parse(tail);
  return parsed.name || parsed.base || 'document';
}

export interface ReadRagDatasetOptions {
  /**
   * Если true — пустой список URI считается ошибкой (для исполнения и preflight).
   * Если false — пустой список разрешён (черновик узла на канве: пользователь
   * только что перетащил плитку и ещё не загрузил файлы). По умолчанию true.
   */
  requireNonEmpty?: boolean;
}

/**
 * Извлекает массив URI из ui_json/config_json/input_json узла RAGDataset
 * и валидирует список. См. data-model.md → "Валидация при мутации".
 *
 * Семантика опции `requireNonEmpty`:
 *   - true (исполнение, smoke-тест) — пустой список → RAG_DATASET_FILE_LIST_EMPTY.
 *   - false (черновик при mutation) — пустой список ОК, остальные правила
 *     (формат, дубли, лимит количества, префикс) проверяются как обычно.
 */
export function readRagDatasetUrisFromConfig(rawConfig: unknown, options: ReadRagDatasetOptions = {}): string[] {
  const requireNonEmpty = options.requireNonEmpty !== false;

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    if (requireNonEmpty) {
      throw httpError400(RAG_DATASET_ERROR_CODES.FILE_LIST_EMPTY, { received: typeof rawConfig });
    }
    return [];
  }

  const record = rawConfig as Record<string, unknown>;
  const rawUris = record.uris;

  if (!Array.isArray(rawUris) || rawUris.length === 0) {
    if (requireNonEmpty) {
      throw httpError400(RAG_DATASET_ERROR_CODES.FILE_LIST_EMPTY, {});
    }
    return [];
  }

  if (rawUris.length > RAG_DATASET_MAX_FILES_PER_NODE) {
    throw httpError400(RAG_DATASET_ERROR_CODES.FILE_LIST_TOO_LONG, {
      received_count: rawUris.length,
      limit: RAG_DATASET_MAX_FILES_PER_NODE,
    });
  }

  const uris: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < rawUris.length; index += 1) {
    const raw: unknown = rawUris[index];
    if (typeof raw !== 'string') {
      throw httpError400(RAG_DATASET_ERROR_CODES.URI_INVALID, {
        index,
        received: typeof raw,
      });
    }
    const uri = raw.trim();
    if (uri.length === 0) {
      throw httpError400(RAG_DATASET_ERROR_CODES.URI_INVALID, { index });
    }

    if (seen.has(uri)) {
      throw httpError400(RAG_DATASET_ERROR_CODES.FILE_DUPLICATE, { index, uri });
    }
    seen.add(uri);

    if (!uri.startsWith(RAG_CORPUS_URI_PREFIX)) {
      throw httpError400(RAG_DATASET_ERROR_CODES.URI_INVALID, {
        index,
        uri,
        expected_prefix: RAG_CORPUS_URI_PREFIX,
      });
    }

    const extension = path.extname(uri).toLowerCase();
    if (!ALLOWED_EXTENSIONS_SET.has(extension)) {
      throw httpError400(RAG_DATASET_ERROR_CODES.FORMAT_INVALID, {
        index,
        uri,
        extension: extension || null,
        allowed: [...RAG_DATASET_ALLOWED_EXTENSIONS],
      });
    }

    uris.push(uri);
  }

  return uris;
}

function httpError400(code: string, details: Record<string, unknown>): HttpError {
  return new HttpError(400, {
    code,
    error: RAG_DATASET_ERROR_MESSAGES[code as keyof typeof RAG_DATASET_ERROR_MESSAGES] ?? 'RAG Dataset validation error',
    details,
  });
}

async function readDocumentFromUri(uri: string, index: number): Promise<LoadedDocument> {
  const absolutePath = resolveRagCorpusAbsolutePath(uri);

  let stats;
  try {
    stats = await stat(absolutePath);
  } catch (error) {
    throw new HttpError(400, {
      code: RAG_DATASET_ERROR_CODES.FILE_NOT_FOUND,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.FILE_NOT_FOUND],
      details: {
        uri,
        path: absolutePath,
        reason: error instanceof Error ? error.message : 'stat failed',
      },
    });
  }

  if (!stats.isFile()) {
    throw new HttpError(400, {
      code: RAG_DATASET_ERROR_CODES.FILE_NOT_FOUND,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.FILE_NOT_FOUND],
      details: { uri, path: absolutePath, reason: 'not a regular file' },
    });
  }

  if (stats.size > RAG_DATASET_MAX_FILE_BYTES) {
    throw new HttpError(400, {
      code: RAG_DATASET_ERROR_CODES.SIZE_EXCEEDED,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.SIZE_EXCEEDED],
      details: {
        uri,
        path: absolutePath,
        size_bytes: stats.size,
        limit_bytes: RAG_DATASET_MAX_FILE_BYTES,
      },
    });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    throw new HttpError(400, {
      code: RAG_DATASET_ERROR_CODES.FILE_READ_ERROR,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.FILE_READ_ERROR],
      details: {
        uri,
        path: absolutePath,
        reason: error instanceof Error ? error.message : 'read failed',
      },
    });
  }

  if (!isValidUtf8(buffer)) {
    throw new HttpError(400, {
      code: RAG_DATASET_ERROR_CODES.ENCODING_INVALID,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.ENCODING_INVALID],
      details: { uri, path: absolutePath },
    });
  }

  const text = buffer.toString('utf8');
  const title = inferTitleFromUri(uri);
  const fallbackId = sanitizeDocumentId(`${title || 'doc'}_${index + 1}`);

  return {
    document_id: fallbackId,
    uri,
    dataset_id: null,
    text,
    title,
    source: RAG_CORPUS_DOCUMENT_SOURCE,
  };
}

export async function buildRagDatasetContractOutput(input: RagDatasetResolvedInput): Promise<Record<string, any>> {
  const documents: LoadedDocument[] = [];

  for (let index = 0; index < input.uris.length; index += 1) {
    const uri = input.uris[index];
    if (!uri) continue;
    const document = await readDocumentFromUri(uri, index);
    documents.push(document);
  }

  return {
    dataset_id: null,
    document_count: documents.length,
    documents,
    documents_manifest: buildInlineArtifactManifest('documents', documents, {
      dataset_id: null,
      source: 'rag-dataset-contract',
    }),
  };
}

export function resolveRagDatasetContractInput(_inputs: unknown[], context: NodeExecutionContext): RagDatasetResolvedInput {
  // Узел RAGDataset — source: входы графа игнорируются, конфиг URI приходит
  // через context.input_json (executor пробрасывает Node.ui_json в input_json
  // для source-узлов). См. node-handler.
  const uris = readRagDatasetUrisFromConfig(context.input_json);
  return { uris };
}

export const ragDatasetToolContractDefinition: ToolContractDefinition = {
  name: RAG_DATASET_NODE_TYPE_NAME,
  aliases: ['ragdataset', 'rag-dataset', 'rag_dataset'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveRagDatasetContractInput,
  buildHttpSuccessOutput: ({ input }) => buildRagDatasetContractOutput(input as RagDatasetResolvedInput),
};
