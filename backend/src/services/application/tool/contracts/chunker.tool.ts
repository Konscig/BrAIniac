import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_CHUNKER_DOCUMENTS = 64;
const MAX_CHUNKER_CHUNKS = 512;
const DEFAULT_CHUNK_SIZE = 120;
const MAX_CHUNK_SIZE = 800;

type ChunkerDocument = {
  document_id: string;
  text: string;
};

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function readNonEmptyText(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    const value = normalizeText(raw);
    return value.length > 0 ? value : undefined;
  }

  if (typeof raw === 'number' || typeof raw === 'boolean') {
    const value = normalizeText(String(raw));
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

function coercePositiveInt(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function clampInteger(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function unwrapPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const nestedKeys = ['value', 'data', 'payload', 'output'];
  for (const key of nestedKeys) {
    if (!(key in record)) continue;

    const nested = unwrapPayload(record[key]);
    if (nested !== undefined && nested !== null) {
      return nested;
    }
  }

  return value;
}

function toChunkerDocument(raw: unknown, index: number): ChunkerDocument | undefined {
  const unwrapped = unwrapPayload(raw);
  const directText = readNonEmptyText(unwrapped);
  if (directText) {
    return {
      document_id: `doc_${index + 1}`,
      text: directText,
    };
  }

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const text =
    readNonEmptyText(record.text) ??
    readNonEmptyText(record.content) ??
    readNonEmptyText(record.body) ??
    readNonEmptyText(record.normalized_text) ??
    readNonEmptyText(record.normalizedText);
  if (!text) return undefined;

  const documentId =
    readNonEmptyText(record.document_id) ??
    readNonEmptyText(record.doc_id) ??
    readNonEmptyText(record.id) ??
    readNonEmptyText(record.uri) ??
    `doc_${index + 1}`;

  return {
    document_id: documentId,
    text,
  };
}

function pushDistinctDocument(out: ChunkerDocument[], raw: unknown) {
  if (out.length >= MAX_CHUNKER_DOCUMENTS) return;

  const candidate = toChunkerDocument(raw, out.length);
  if (!candidate) return;

  const key = `${candidate.document_id.toLowerCase()}::${candidate.text.toLowerCase()}`;
  const exists = out.some((entry) => `${entry.document_id.toLowerCase()}::${entry.text.toLowerCase()}` === key);
  if (!exists) {
    out.push(candidate);
  }
}

function collectDocuments(value: unknown, out: ChunkerDocument[]) {
  const unwrapped = unwrapPayload(value);

  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (out.length >= MAX_CHUNKER_DOCUMENTS) break;
      pushDistinctDocument(out, entry);
    }
    return;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    pushDistinctDocument(out, unwrapped);
    return;
  }

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['normalized_documents', 'normalizedDocuments', 'documents', 'items', 'records'];

  for (const key of listKeys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) continue;

    for (const item of candidate) {
      if (out.length >= MAX_CHUNKER_DOCUMENTS) break;
      pushDistinctDocument(out, item);
    }
  }

  pushDistinctDocument(out, record.document);
  pushDistinctDocument(out, record);
}

function normalizeInputDocuments(raw: unknown): ChunkerDocument[] {
  if (!Array.isArray(raw)) return [];

  const out: ChunkerDocument[] = [];
  for (const entry of raw.slice(0, MAX_CHUNKER_DOCUMENTS)) {
    const candidate = toChunkerDocument(entry, out.length);
    if (candidate) {
      out.push(candidate);
    }
  }

  return out;
}

function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const tokens = normalized.split(' ').filter((token) => token.length > 0);
  if (tokens.length === 0) return [];

  const step = Math.max(1, chunkSize - overlap);
  const out: string[] = [];
  for (let start = 0; start < tokens.length; start += step) {
    const end = Math.min(tokens.length, start + chunkSize);
    const chunk = tokens.slice(start, end).join(' ');
    if (chunk.length > 0) {
      out.push(chunk);
    }

    if (end >= tokens.length || out.length >= MAX_CHUNKER_CHUNKS) {
      break;
    }
  }

  return out;
}

/**
 * Формирует deterministic output контракта Chunker.
 * Разбивает документы на окна слов с учетом chunk_size и overlap.
 *
 * @param input Нормализованный вход контракта.
 * @returns Детерминированный результат разбиения документов на чанки.
 */
function buildChunkerContractOutput(input: Record<string, any>): Record<string, any> {
  const documents = normalizeInputDocuments(input.documents);
  const requestedChunkSize = coercePositiveInt(input.chunk_size) ?? DEFAULT_CHUNK_SIZE;
  const chunkSize = clampInteger(requestedChunkSize, 2, MAX_CHUNK_SIZE);

  const requestedOverlap = Number(input.overlap);
  const overlapBase = Number.isInteger(requestedOverlap) ? requestedOverlap : Math.floor(chunkSize * 0.2);
  const overlap = clampInteger(overlapBase, 0, Math.max(0, chunkSize - 1));

  const chunks: Array<Record<string, any>> = [];
  for (const doc of documents) {
    const docChunks = splitTextIntoChunks(doc.text, chunkSize, overlap);
    for (let index = 0; index < docChunks.length; index += 1) {
      const chunkText = docChunks[index];
      if (chunks.length >= MAX_CHUNKER_CHUNKS) break;
      chunks.push({
        chunk_id: `${doc.document_id}_chunk_${index + 1}`,
        document_id: doc.document_id,
        text: chunkText,
        order: chunks.length + 1,
      });
    }

    if (chunks.length >= MAX_CHUNKER_CHUNKS) break;
  }

  return {
    strategy: 'word-window',
    chunk_size: chunkSize,
    overlap,
    chunk_count: chunks.length,
    chunks,
  };
}

/**
 * Нормализует и валидирует вход Chunker: собирает документы,
 * ограничивает размер чанка и пересечение по безопасным границам.
 *
 * @param inputs Выходы предыдущих узлов пайплайна.
 * @param context Контекст выполнения текущего узла.
 * @returns Нормализованный вход для executor-а.
 * @throws {HttpError} Если не удалось получить ни одного документа.
 */
export function resolveChunkerContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const documents: ChunkerDocument[] = [];
  collectDocuments(context.input_json, documents);
  for (const source of inputs.slice(0, 16)) {
    if (documents.length >= MAX_CHUNKER_DOCUMENTS) break;
    collectDocuments(source, documents);
  }

  if (documents.length === 0) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'Chunker contract requires non-empty normalized_documents or documents',
      details: { contract: 'Chunker' },
    });
  }

  const inputRecord = context.input_json && typeof context.input_json === 'object' ? (context.input_json as Record<string, unknown>) : {};
  const requestedChunkSize = coercePositiveInt(inputRecord.chunk_size ?? inputRecord.chunkSize) ?? DEFAULT_CHUNK_SIZE;
  const chunkSize = clampInteger(requestedChunkSize, 2, MAX_CHUNK_SIZE);

  const requestedOverlap = Number(inputRecord.overlap ?? inputRecord.chunk_overlap ?? inputRecord.chunkOverlap);
  const overlapBase = Number.isInteger(requestedOverlap) ? requestedOverlap : Math.floor(chunkSize * 0.2);
  const overlap = clampInteger(overlapBase, 0, Math.max(0, chunkSize - 1));

  return {
    documents,
    strategy: 'word-window',
    chunk_size: chunkSize,
    overlap,
  };
}

/**
 * Определяет контракт Chunker, его алиасы и допустимые executor-ы.
 */
export const chunkerToolContractDefinition: ToolContractDefinition = {
  name: 'Chunker',
  aliases: ['chunker', 'text-chunker', 'text_chunker'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveChunkerContractInput,
  buildHttpSuccessOutput: ({ input }) => buildChunkerContractOutput(input),
};