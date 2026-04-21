import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import { buildInlineArtifactManifest, listArtifactManifestItems } from './tool-artifact.manifest.js';
import { normalizeText, readNonEmptyText, unwrapPayload } from './tool-contract.input.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_VECTOR_UPSERT_ITEMS = 512;
const MAX_VECTOR_DIMENSION = 4096;

type VectorItem = {
  vector_id: string;
  vector: number[];
  chunk_id: string | null;
  document_id: string | null;
  text: string | null;
  provider: string | null;
  model: string | null;
  order: number | null;
};

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
      text: null,
      provider: null,
      model: null,
      order: null,
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

  const orderValue = Number(record.order);

  return {
    vector_id: vectorId,
    vector,
    chunk_id: readNonEmptyText(record.chunk_id) ?? null,
    document_id: readNonEmptyText(record.document_id) ?? null,
    text:
      readNonEmptyText(record.text) ??
      readNonEmptyText(record.chunk_text) ??
      readNonEmptyText(record.content) ??
      readNonEmptyText(record.snippet) ??
      null,
    provider: readNonEmptyText(record.provider) ?? null,
    model: readNonEmptyText(record.model) ?? null,
    order: Number.isFinite(orderValue) ? Number(orderValue) : null,
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
  const manifestItems = listArtifactManifestItems(value, ['vectors']);
  for (const item of manifestItems) {
    if (out.length >= MAX_VECTOR_UPSERT_ITEMS) break;
    pushVector(out, item);
  }

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

function buildStoredVectorRows(
  vectors: VectorItem[],
  indexName: string,
  namespace: string,
): Array<Record<string, any>> {
  return vectors.map((entry, index) => ({
    vector_id: entry.vector_id,
    ...(entry.chunk_id ? { chunk_id: entry.chunk_id } : {}),
    ...(entry.document_id ? { document_id: entry.document_id } : {}),
    ...(entry.text ? { text: entry.text } : {}),
    vector: entry.vector,
    order: entry.order ?? index + 1,
    index_name: indexName,
    namespace,
    ...(entry.provider ? { provider: entry.provider } : {}),
    ...(entry.model ? { model: entry.model } : {}),
  }));
}

function buildVectorUpsertContractOutput(input: Record<string, any>): Record<string, any> {
  const vectors = dedupeVectors(normalizeInputVectors(input.vectors));
  const indexName = readNonEmptyText(input.index_name) ?? 'default-index';
  const namespace = readNonEmptyText(input.namespace) ?? 'default';
  const upsertIds = vectors.map((entry) => entry.vector_id);
  const storedVectors = buildStoredVectorRows(vectors, indexName, namespace);

  return {
    index_name: indexName,
    namespace,
    upserted_count: upsertIds.length,
    vector_size: storedVectors[0]?.vector.length ?? 0,
    upsert_ids: upsertIds,
    status: 'upserted',
    storage_backend: 'artifact-manifest',
    stored_vector_count: storedVectors.length,
    vectors_manifest: buildInlineArtifactManifest('vectors', storedVectors, {
      storage_backend: 'artifact-manifest',
      index_name: indexName,
      namespace,
    }),
  };
}

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

export const vectorUpsertToolContractDefinition: ToolContractDefinition = {
  name: 'VectorUpsert',
  aliases: ['vectorupsert', 'vector-upsert', 'vector_upsert'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveVectorUpsertContractInput,
  buildHttpSuccessOutput: ({ input }) => buildVectorUpsertContractOutput(input),
};
