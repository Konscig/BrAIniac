import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import { buildInlineArtifactManifest, listArtifactManifestItems } from './tool-artifact.manifest.js';
import {
  clampInt as clampInteger,
  coerceOptionalPositiveInt as coercePositiveInt,
  normalizeText,
  readNonEmptyText,
  unwrapPayload,
} from './tool-contract.input.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_EMBEDDER_CHUNKS = 256;
const DEFAULT_BATCH_SIZE = 16;
const MAX_BATCH_SIZE = 64;
const DEFAULT_VECTOR_SIZE = 8;
const MAX_VECTOR_SIZE = 64;

type EmbedderChunk = {
  chunk_id: string;
  document_id: string | null;
  text: string;
};

function toEmbedderChunk(raw: unknown, index: number): EmbedderChunk | undefined {
  const unwrapped = unwrapPayload(raw);
  const directText = readNonEmptyText(unwrapped);
  if (directText) {
    return {
      chunk_id: `chunk_${index + 1}`,
      document_id: null,
      text: directText,
    };
  }

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const text =
    readNonEmptyText(record.text) ??
    readNonEmptyText(record.content) ??
    readNonEmptyText(record.body) ??
    readNonEmptyText(record.chunk_text);
  if (!text) return undefined;

  const chunkId =
    readNonEmptyText(record.chunk_id) ??
    readNonEmptyText(record.id) ??
    readNonEmptyText(record.document_id) ??
    `chunk_${index + 1}`;
  const documentId = readNonEmptyText(record.document_id) ?? null;

  return {
    chunk_id: chunkId,
    document_id: documentId,
    text,
  };
}

function pushDistinctChunk(out: EmbedderChunk[], raw: unknown) {
  if (out.length >= MAX_EMBEDDER_CHUNKS) return;

  const candidate = toEmbedderChunk(raw, out.length);
  if (!candidate) return;

  const key = `${candidate.chunk_id.toLowerCase()}::${candidate.text.toLowerCase()}`;
  const exists = out.some((entry) => `${entry.chunk_id.toLowerCase()}::${entry.text.toLowerCase()}` === key);
  if (!exists) {
    out.push(candidate);
  }
}

function collectChunks(value: unknown, out: EmbedderChunk[]) {
  const manifestItems = listArtifactManifestItems(value, ['chunks']);
  for (const item of manifestItems) {
    if (out.length >= MAX_EMBEDDER_CHUNKS) break;
    pushDistinctChunk(out, item);
  }

  const unwrapped = unwrapPayload(value);

  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (out.length >= MAX_EMBEDDER_CHUNKS) break;
      pushDistinctChunk(out, entry);
    }
    return;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    pushDistinctChunk(out, unwrapped);
    return;
  }

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['chunks', 'documents', 'items', 'records'];

  for (const key of listKeys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) continue;

    for (const item of candidate) {
      if (out.length >= MAX_EMBEDDER_CHUNKS) break;
      pushDistinctChunk(out, item);
    }
  }

  pushDistinctChunk(out, record.chunk);
  pushDistinctChunk(out, record);
}

function normalizeInputChunks(raw: unknown): EmbedderChunk[] {
  if (!Array.isArray(raw)) return [];

  const out: EmbedderChunk[] = [];
  for (const entry of raw.slice(0, MAX_EMBEDDER_CHUNKS)) {
    const candidate = toEmbedderChunk(entry, out.length);
    if (candidate) {
      out.push(candidate);
    }
  }

  return out;
}

function buildDeterministicVector(text: string, size: number): number[] {
  const normalized = normalizeText(text);
  const vector = new Array<number>(size).fill(0);

  if (!normalized) {
    return vector;
  }

  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    const slot = i % size;
    vector[slot] = (vector[slot] ?? 0) + ((code % 251) + 1) / 251;
  }

  return vector.map((value) => Number((value / normalized.length).toFixed(6)));
}

function buildEmbedderContractOutputFromInput(input: Record<string, any>, provider: string): Record<string, any> {
  const chunks = normalizeInputChunks(input.chunks);
  const requestedVectorSize = coercePositiveInt(input.vector_size) ?? DEFAULT_VECTOR_SIZE;
  const vectorSize = clampInteger(requestedVectorSize, 2, MAX_VECTOR_SIZE);
  const model = readNonEmptyText(input.model) ?? null;

  const vectors = chunks.map((chunk, index) => ({
    chunk_id: chunk.chunk_id,
    ...(chunk.document_id ? { document_id: chunk.document_id } : {}),
    text: chunk.text,
    vector: buildDeterministicVector(chunk.text, vectorSize),
    order: index + 1,
    provider,
    ...(model ? { model } : {}),
  }));

  return {
    provider,
    ...(model ? { model } : {}),
    vector_size: vectorSize,
    vector_count: vectors.length,
    vectors,
    vectors_manifest: buildInlineArtifactManifest('vectors', vectors, {
      provider,
      ...(model ? { model } : {}),
      vector_size: vectorSize,
    }),
  };
}

export function resolveEmbedderContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const chunks: EmbedderChunk[] = [];
  collectChunks(context.input_json, chunks);
  for (const source of inputs.slice(0, 16)) {
    if (chunks.length >= MAX_EMBEDDER_CHUNKS) break;
    collectChunks(source, chunks);
  }

  if (chunks.length === 0) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'Embedder contract requires non-empty chunks',
      details: { contract: 'Embedder' },
    });
  }

  const inputRecord = context.input_json && typeof context.input_json === 'object' ? (context.input_json as Record<string, unknown>) : {};
  const requestedBatchSize = coercePositiveInt(inputRecord.batch_size) ?? DEFAULT_BATCH_SIZE;
  const batchSize = clampInteger(requestedBatchSize, 1, MAX_BATCH_SIZE);

  const requestedVectorSize = coercePositiveInt(inputRecord.vector_size ?? inputRecord.embedding_size) ?? DEFAULT_VECTOR_SIZE;
  const vectorSize = clampInteger(requestedVectorSize, 2, MAX_VECTOR_SIZE);
  const model = readNonEmptyText(inputRecord.model) ?? readNonEmptyText(inputRecord.embedding_model);

  return {
    chunks,
    batch_size: batchSize,
    vector_size: vectorSize,
    ...(model ? { model } : {}),
  };
}

export const embedderToolContractDefinition: ToolContractDefinition = {
  name: 'Embedder',
  aliases: ['embedder', 'text-embedder', 'text_embedder'],
  allowedExecutors: ['http-json', 'openrouter-embeddings'],
  resolveInput: resolveEmbedderContractInput,
  buildHttpSuccessOutput: ({ input }) => buildEmbedderContractOutputFromInput(input, 'http-json'),
  buildEmbeddingSuccessOutput: ({ input, model, embeddings }) => {
    const chunks = normalizeInputChunks(input.chunks);
    const rows = Array.isArray(embeddings) ? embeddings : [];
    const total = Math.min(chunks.length, rows.length);

    const vectors: Array<Record<string, any>> = [];
    for (let index = 0; index < total; index += 1) {
      const chunk = chunks[index];
      if (!chunk) continue;

      const row = rows[index];
      const vector = Array.isArray(row)
        ? row.map((value) => (Number.isFinite(value) ? Number(value) : 0))
        : [];

      vectors.push({
        chunk_id: chunk.chunk_id,
        ...(chunk.document_id ? { document_id: chunk.document_id } : {}),
        text: chunk.text,
        vector,
        order: index + 1,
        provider: 'openrouter-embeddings',
        model,
      });
    }

    return {
      provider: 'openrouter-embeddings',
      model,
      vector_size: vectors[0]?.vector?.length ?? 0,
      vector_count: vectors.length,
      vectors,
      vectors_manifest: buildInlineArtifactManifest('vectors', vectors, {
        provider: 'openrouter-embeddings',
        model,
        vector_size: vectors[0]?.vector?.length ?? 0,
      }),
    };
  },
};
