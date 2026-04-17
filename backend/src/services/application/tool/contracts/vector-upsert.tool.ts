import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_VECTOR_UPSERT_ITEMS = 512;
const MAX_VECTOR_DIMENSION = 4096;

type VectorItem = {
  vector_id: string;
  vector: number[];
  chunk_id: string | null;
  document_id: string | null;
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

function toVector(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];

  const out: number[] = [];
  for (const entry of raw.slice(0, MAX_VECTOR_DIMENSION)) {
    const value = Number(entry);
    if (Number.isFinite(value)) {
      out.push(Number(value));
    }
  }

  return out;
}

function toVectorItem(raw: unknown, index: number): VectorItem | undefined {
  const unwrapped = unwrapPayload(raw);

  if (Array.isArray(unwrapped)) {
    const vector = toVector(unwrapped);
    if (vector.length === 0) return undefined;

    return {
      vector_id: `vec_${index + 1}`,
      vector,
      chunk_id: null,
      document_id: null,
    };
  }

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const vector = toVector(record.vector ?? record.embedding ?? record.values ?? record.coordinates);
  if (vector.length === 0) return undefined;

  const vectorId =
    readNonEmptyText(record.vector_id) ??
    readNonEmptyText(record.id) ??
    readNonEmptyText(record.chunk_id) ??
    `vec_${index + 1}`;

  return {
    vector_id: vectorId,
    vector,
    chunk_id: readNonEmptyText(record.chunk_id) ?? null,
    document_id: readNonEmptyText(record.document_id) ?? null,
  };
}

function pushVector(out: VectorItem[], raw: unknown) {
  if (out.length >= MAX_VECTOR_UPSERT_ITEMS) return;

  const candidate = toVectorItem(raw, out.length);
  if (!candidate) return;

  const signature = `${candidate.vector_id.toLowerCase()}::${candidate.vector.map((value) => value.toFixed(8)).join(',')}`;
  const exists = out.some(
    (entry) => `${entry.vector_id.toLowerCase()}::${entry.vector.map((value) => value.toFixed(8)).join(',')}` === signature,
  );
  if (!exists) {
    out.push(candidate);
  }
}

function collectVectors(value: unknown, out: VectorItem[]) {
  const unwrapped = unwrapPayload(value);

  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (out.length >= MAX_VECTOR_UPSERT_ITEMS) break;
      pushVector(out, entry);
    }
    return;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    pushVector(out, unwrapped);
    return;
  }

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['vectors', 'embeddings', 'items', 'records'];
  for (const key of listKeys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) continue;

    for (const item of candidate) {
      if (out.length >= MAX_VECTOR_UPSERT_ITEMS) break;
      pushVector(out, item);
    }
  }

  pushVector(out, record.vector);
  pushVector(out, record.embedding);
}

function normalizeInputVectors(raw: unknown): VectorItem[] {
  if (!Array.isArray(raw)) return [];

  const out: VectorItem[] = [];
  for (const entry of raw.slice(0, MAX_VECTOR_UPSERT_ITEMS)) {
    const item = toVectorItem(entry, out.length);
    if (item) {
      out.push(item);
    }
  }

  return out;
}

function dedupeVectors(items: VectorItem[]): VectorItem[] {
  const out = new Map<string, VectorItem>();
  for (const item of items) {
    const key = item.vector_id.toLowerCase();
    if (!out.has(key)) {
      out.set(key, item);
    }
  }

  return Array.from(out.values());
}

/**
 * Формирует итог upsert-результат для контракта VectorUpsert.
 *
 * @param input Нормализованный вход контракта.
 * @returns Детерминированный результат операции upsert.
 */
function buildVectorUpsertContractOutput(input: Record<string, any>): Record<string, any> {
  const vectors = dedupeVectors(normalizeInputVectors(input.vectors));
  const upsertIds = vectors.map((entry) => entry.vector_id);

  return {
    index_name: readNonEmptyText(input.index_name) ?? 'default-index',
    namespace: readNonEmptyText(input.namespace) ?? 'default',
    upserted_count: upsertIds.length,
    vector_size: vectors[0]?.vector.length ?? 0,
    upsert_ids: upsertIds,
    status: 'upserted',
  };
}

/**
 * Нормализует вход VectorUpsert, собирает векторы из разных оберток
 * и проверяет, что после дедупликации есть хотя бы один валидный элемент.
 *
 * @param inputs Выходы предыдущих узлов пайплайна.
 * @param context Контекст выполнения текущего узла.
 * @returns Нормализованный вход для executor-а.
 * @throws {HttpError} Если не найдено ни одного валидного вектора.
 */
export function resolveVectorUpsertContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const inputRecord = context.input_json && typeof context.input_json === 'object' ? (context.input_json as Record<string, unknown>) : {};

  const vectors: VectorItem[] = [];
  const directVectors = normalizeInputVectors(inputRecord.vectors ?? inputRecord.embeddings);
  if (directVectors.length > 0) {
    vectors.push(...directVectors);
  } else {
    collectVectors(context.input_json, vectors);
  }

  if (vectors.length === 0) {
    for (const source of inputs.slice(0, 16)) {
      if (vectors.length >= MAX_VECTOR_UPSERT_ITEMS) break;
      collectVectors(source, vectors);
    }
  }

  if (vectors.length === 0) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'VectorUpsert contract requires non-empty vectors',
      details: { contract: 'VectorUpsert' },
    });
  }

  const uniqueVectors = dedupeVectors(vectors);

  const indexName = readNonEmptyText(inputRecord.index_name ?? inputRecord.indexName) ?? 'default-index';
  const namespace = readNonEmptyText(inputRecord.namespace ?? inputRecord.tenant) ?? 'default';

  return {
    index_name: indexName,
    namespace,
    vectors: uniqueVectors,
  };
}

/**
 * Определяет контракт VectorUpsert, его алиасы и допустимые executor-ы.
 */
export const vectorUpsertToolContractDefinition: ToolContractDefinition = {
  name: 'VectorUpsert',
  aliases: ['vectorupsert', 'vector-upsert', 'vector_upsert'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveVectorUpsertContractInput,
  buildHttpSuccessOutput: ({ input }) => buildVectorUpsertContractOutput(input),
};
