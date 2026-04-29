import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import { buildInlineArtifactManifest, listArtifactManifestItems } from './tool-artifact.manifest.js';
import {
  clampNumber,
  coerceOptionalPositiveInt,
  normalizeText,
  readNonEmptyText,
  unwrapPayload,
} from './tool-contract.input.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_RETRIEVER_TOP_K = 50;
const DEFAULT_RETRIEVER_TOP_K = 5;
const MAX_RETRIEVER_RECORDS = 512;
const DEFAULT_SNIPPET_WINDOW = 28;

type RetrieverMode = 'dense' | 'sparse' | 'hybrid';

type IndexedVectorRecord = {
  vector_id: string;
  chunk_id: string | null;
  document_id: string | null;
  text: string | null;
  vector: number[];
  provider: string | null;
  model: string | null;
};

function tokenize(raw: string): string[] {
  const matches = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!matches) return [];
  return matches.filter((token) => token.length > 1);
}

function extractRetrievalQuery(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);

  const direct = readNonEmptyText(unwrapped);
  if (direct) return direct;

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const textKeys = ['retrieval_query', 'user_query', 'query', 'question', 'normalized_query'];
  for (const key of textKeys) {
    const text = readNonEmptyText(record[key]);
    if (text) return text;
  }

  const keywords = record.keywords;
  if (Array.isArray(keywords)) {
    const terms = keywords
      .map((entry) => readNonEmptyText(entry))
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    if (terms.length > 0) {
      return terms.join(' ');
    }
  }

  return undefined;
}

function resolveMode(raw: unknown): RetrieverMode {
  const value = readNonEmptyText(raw)?.toLowerCase();
  if (value === 'dense' || value === 'sparse' || value === 'hybrid') return value;
  return 'hybrid';
}

function resolveTopK(raw: unknown): number {
  const topK = coerceOptionalPositiveInt(raw) ?? DEFAULT_RETRIEVER_TOP_K;
  return topK > MAX_RETRIEVER_TOP_K ? MAX_RETRIEVER_TOP_K : topK;
}

function resolveAlpha(raw: unknown): number {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0.5;
  return Number(clampNumber(numeric, 0, 1).toFixed(3));
}

function readBooleanFlag(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') {
    if (raw === 1) return true;
    if (raw === 0) return false;
    return undefined;
  }

  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function toVector(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];

  const out: number[] = [];
  for (const entry of raw) {
    const value = Number(entry);
    if (Number.isFinite(value)) {
      out.push(Number(value));
    }
  }

  return out;
}

function toIndexedVectorRecord(raw: unknown, index: number): IndexedVectorRecord | undefined {
  const unwrapped = unwrapPayload(raw);
  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const vector = toVector(record.vector ?? record.embedding ?? record.values ?? record.coordinates);
  const text =
    readNonEmptyText(record.text) ??
    readNonEmptyText(record.chunk_text) ??
    readNonEmptyText(record.content) ??
    readNonEmptyText(record.body) ??
    readNonEmptyText(record.snippet) ??
    null;

  if (vector.length === 0 && !text) return undefined;

  const chunkId = readNonEmptyText(record.chunk_id) ?? readNonEmptyText(record.id) ?? `chunk_${index + 1}`;
  const vectorId =
    readNonEmptyText(record.vector_id) ??
    chunkId ??
    readNonEmptyText(record.id) ??
    `vec_${index + 1}`;

  return {
    vector_id: vectorId,
    chunk_id: chunkId ?? null,
    document_id: readNonEmptyText(record.document_id) ?? null,
    text,
    vector,
    provider: readNonEmptyText(record.provider) ?? null,
    model: readNonEmptyText(record.model) ?? null,
  };
}

function pushIndexedVectorRecord(out: IndexedVectorRecord[], raw: unknown) {
  if (out.length >= MAX_RETRIEVER_RECORDS) return;

  const candidate = toIndexedVectorRecord(raw, out.length);
  if (!candidate) return;

  const key = `${(candidate.chunk_id ?? candidate.vector_id).toLowerCase()}::${(candidate.document_id ?? '').toLowerCase()}`;
  const exists = out.some((entry) => `${(entry.chunk_id ?? entry.vector_id).toLowerCase()}::${(entry.document_id ?? '').toLowerCase()}` === key);
  if (!exists) {
    out.push(candidate);
  }
}

function collectIndexedVectorRecords(value: unknown, out: IndexedVectorRecord[]) {
  const manifestItems = listArtifactManifestItems(value, ['vectors']);
  for (const item of manifestItems) {
    if (out.length >= MAX_RETRIEVER_RECORDS) break;
    pushIndexedVectorRecord(out, item);
  }

  const unwrapped = unwrapPayload(value);

  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (out.length >= MAX_RETRIEVER_RECORDS) break;
      pushIndexedVectorRecord(out, entry);
    }
    return;
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    pushIndexedVectorRecord(out, unwrapped);
    return;
  }

  const record = unwrapped as Record<string, unknown>;
  const listKeys = ['vectors', 'items', 'records', 'indexed_vectors'];
  for (const key of listKeys) {
    const list = record[key];
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (out.length >= MAX_RETRIEVER_RECORDS) break;
      pushIndexedVectorRecord(out, entry);
    }
  }

  pushIndexedVectorRecord(out, record.vector);
}

function normalizeInputRecords(raw: unknown): IndexedVectorRecord[] {
  if (!Array.isArray(raw)) return [];

  const out: IndexedVectorRecord[] = [];
  for (const entry of raw.slice(0, MAX_RETRIEVER_RECORDS)) {
    const candidate = toIndexedVectorRecord(entry, out.length);
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

function cosineSimilarity(a: number[], b: number[]): number {
  const size = Math.min(a.length, b.length);
  if (size <= 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < size; index += 1) {
    const left = Number.isFinite(a[index]) ? Number(a[index]) : 0;
    const right = Number.isFinite(b[index]) ? Number(b[index]) : 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }

  if (normA <= 0 || normB <= 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

function buildSnippet(text: string | null, queryTerms: string[]): string {
  const normalized = normalizeText(text ?? '');
  if (!normalized) return 'indexed retrieval record';

  const tokens = normalized.split(' ').filter((token) => token.length > 0);
  if (tokens.length <= DEFAULT_SNIPPET_WINDOW) return normalized;

  const lowerTokens = tokens.map((token) => token.toLowerCase());
  const firstMatchIndex = lowerTokens.findIndex((token) => queryTerms.some((term) => token.includes(term)));
  const center = firstMatchIndex >= 0 ? firstMatchIndex : 0;
  const start = Math.max(0, center - Math.floor(DEFAULT_SNIPPET_WINDOW / 3));
  const end = Math.min(tokens.length, start + DEFAULT_SNIPPET_WINDOW);
  return tokens.slice(start, end).join(' ');
}

function scoreSparse(queryTerms: string[], text: string | null): number {
  const normalized = normalizeText(text ?? '');
  if (!normalized || queryTerms.length === 0) return 0;

  const textTokens = tokenize(normalized);
  if (textTokens.length === 0) return 0;

  const textSet = new Set(textTokens);
  const querySet = new Set(queryTerms);
  const overlapTerms = Array.from(querySet).filter((term) => textSet.has(term));
  const coverage = overlapTerms.length / querySet.size;
  const density = overlapTerms.length / Math.min(textTokens.length, queryTerms.length + 4);
  const phraseBoost =
    overlapTerms.length > 1 && normalized.toLowerCase().includes(overlapTerms.slice(0, 2).join(' ')) ? 0.08 : 0;

  return Number(clampNumber(coverage * 0.72 + density * 0.28 + phraseBoost, 0, 1).toFixed(6));
}

function shouldUseDenseSimilarity(record: IndexedVectorRecord): boolean {
  if (!Array.isArray(record.vector) || record.vector.length === 0) return false;
  if (!record.provider) return true;
  return record.provider === 'http-json';
}

function buildNoResultsHybridRetrieverContractOutput(input: Record<string, any>, indexedRecordCount = 0): Record<string, any> {
  const retrievalQuery = normalizeText(String(input.retrieval_query ?? ''));
  const topK = resolveTopK(input.top_k);
  const mode = resolveMode(input.mode);
  const alpha = resolveAlpha(input.alpha);

  return {
    retrieval_query: retrievalQuery,
    top_k: topK,
    mode,
    alpha,
    candidate_count: 0,
    indexed_record_count: indexedRecordCount,
    retrieval_source: 'no-results',
    no_results: true,
    candidates: [],
    candidates_manifest: buildInlineArtifactManifest('retrieval_candidates', [], {
      retrieval_source: 'no-results',
      indexed_record_count: indexedRecordCount,
      top_k: topK,
      mode,
      alpha,
    }),
  };
}

function buildArtifactBackedHybridRetrieverContractOutput(input: Record<string, any>): Record<string, any> {
  const retrievalQuery = normalizeText(String(input.retrieval_query ?? ''));
  const topK = resolveTopK(input.top_k);
  const mode = resolveMode(input.mode);
  const alpha = resolveAlpha(input.alpha);
  const records = normalizeInputRecords(input.records);
  const queryTerms = tokenize(retrievalQuery);

  const scored = records.map((record, index) => {
    const sparseScore = scoreSparse(queryTerms, record.text);
    const denseScore = shouldUseDenseSimilarity(record)
      ? Number(
          clampNumber((cosineSimilarity(buildDeterministicVector(retrievalQuery, record.vector.length), record.vector) + 1) / 2, 0, 1).toFixed(6),
        )
      : 0;

    let score = sparseScore;
    if (mode === 'dense') {
      score = denseScore > 0 ? denseScore : sparseScore;
    } else if (mode === 'hybrid') {
      score = denseScore > 0 ? alpha * denseScore + (1 - alpha) * sparseScore : sparseScore;
    }

    if (score <= 0 && record.text) {
      score = 0.001;
    }

    return {
      rankSeed: index + 1,
      document_id: record.document_id ?? `doc_${index + 1}`,
      chunk_id: record.chunk_id ?? record.vector_id,
      score: Number(score.toFixed(6)),
      sparse_score: Number(sparseScore.toFixed(6)),
      dense_score: Number(denseScore.toFixed(6)),
      snippet: buildSnippet(record.text, queryTerms),
      mode,
      provider: record.provider,
      model: record.model,
    };
  });

  const candidates = scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.sparse_score !== left.sparse_score) return right.sparse_score - left.sparse_score;
      return left.rankSeed - right.rankSeed;
    })
    .slice(0, topK)
    .map((entry, index) => ({
      rank: index + 1,
      document_id: entry.document_id,
      chunk_id: entry.chunk_id,
      score: Number(entry.score.toFixed(3)),
      sparse_score: Number(entry.sparse_score.toFixed(3)),
      dense_score: Number(entry.dense_score.toFixed(3)),
      mode,
      snippet: entry.snippet,
      ...(entry.provider ? { provider: entry.provider } : {}),
      ...(entry.model ? { model: entry.model } : {}),
    }));

  if (candidates.length === 0) {
    return buildNoResultsHybridRetrieverContractOutput(input, records.length);
  }

  return {
    retrieval_query: retrievalQuery,
    top_k: topK,
    mode,
    alpha,
    candidate_count: candidates.length,
    indexed_record_count: records.length,
    retrieval_source: 'artifact-vectors',
    candidates,
    candidates_manifest: buildInlineArtifactManifest('retrieval_candidates', candidates, {
      retrieval_source: 'artifact-vectors',
      indexed_record_count: records.length,
      top_k: topK,
      mode,
      alpha,
    }),
  };
}

function buildHybridRetrieverContractOutput(input: Record<string, any>): Record<string, any> {
  const records = normalizeInputRecords(input.records);
  const requireArtifactBacked = readBooleanFlag(input.require_artifact_backed_retrieval) === true;
  if (requireArtifactBacked && records.length === 0) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'HybridRetriever requires artifact-backed records for this execution',
      details: {
        contract: 'HybridRetriever',
        require_artifact_backed_retrieval: true,
      },
    });
  }

  return records.length > 0
    ? buildArtifactBackedHybridRetrieverContractOutput(input)
    : buildNoResultsHybridRetrieverContractOutput(input, 0);
}

export function resolveHybridRetrieverContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const fromInputJson = extractRetrievalQuery(context.input_json);
  const fromInputs = fromInputJson
    ? undefined
    : inputs.map((entry) => extractRetrievalQuery(entry)).find((entry) => typeof entry === 'string' && entry.length > 0);

  const retrievalQuery = fromInputJson ?? fromInputs;
  if (!retrievalQuery) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'HybridRetriever contract requires non-empty retrieval_query',
      details: { contract: 'HybridRetriever' },
    });
  }

  const inputRecord = context.input_json && typeof context.input_json === 'object' ? (context.input_json as Record<string, unknown>) : {};
  const records: IndexedVectorRecord[] = [];
  for (const source of inputs.slice(0, 16)) {
    if (records.length >= MAX_RETRIEVER_RECORDS) break;
    collectIndexedVectorRecords(source, records);
  }

  return {
    retrieval_query: retrievalQuery,
    top_k: resolveTopK(inputRecord.top_k),
    mode: resolveMode(inputRecord.mode),
    alpha: resolveAlpha(inputRecord.alpha),
    ...(readBooleanFlag(inputRecord.require_artifact_backed_retrieval) !== undefined
      ? {
          require_artifact_backed_retrieval: readBooleanFlag(inputRecord.require_artifact_backed_retrieval) === true,
        }
      : {}),
    ...(records.length > 0 ? { records } : {}),
  };
}

export const hybridRetrieverToolContractDefinition: ToolContractDefinition = {
  name: 'HybridRetriever',
  aliases: ['hybridretriever', 'hybrid-retriever', 'hybrid_retriever'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveHybridRetrieverContractInput,
  buildHttpSuccessOutput: ({ input }) => buildHybridRetrieverContractOutput(input),
};
