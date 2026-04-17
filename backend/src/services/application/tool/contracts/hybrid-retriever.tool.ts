import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_RETRIEVER_TOP_K = 50;
const DEFAULT_RETRIEVER_TOP_K = 5;

type RetrieverMode = 'dense' | 'sparse' | 'hybrid';

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

function coerceOptionalPositiveInt(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
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
  const textKeys = [
    'retrieval_query',
    'retrievalQuery',
    'user_query',
    'query',
    'question',
    'prompt',
    'normalized_query',
  ];
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

/**
 * Формирует детерминированный набор кандидатов для HybridRetriever.
 *
 * @param input Нормализованный вход контракта.
 * @returns Детерминированный список retrieval-кандидатов.
 */
function buildHybridRetrieverContractOutput(input: Record<string, any>): Record<string, any> {
  const retrievalQuery = normalizeText(String(input.retrieval_query ?? ''));
  const topK = resolveTopK(input.top_k);
  const mode = resolveMode(input.mode);
  const alpha = resolveAlpha(input.alpha);

  const terms = tokenize(retrievalQuery);
  const fallbackTerms = terms.length > 0 ? terms : ['context'];
  const modeBaseScore = mode === 'dense' ? 0.9 : mode === 'sparse' ? 0.82 : 0.86;

  const candidates = Array.from({ length: topK }, (_, index) => {
    const primary = fallbackTerms[index % fallbackTerms.length] ?? 'context';
    const secondary = fallbackTerms[(index + 1) % fallbackTerms.length] ?? 'passage';
    const rank = index + 1;
    const score = Number(Math.max(0.05, modeBaseScore - index * 0.06 + (mode === 'hybrid' ? alpha * 0.02 : 0)).toFixed(3));

    return {
      rank,
      document_id: `doc_${rank}`,
      chunk_id: `chunk_${rank}`,
      score,
      mode,
      snippet: `${primary} ${secondary} context passage ${rank}`,
    };
  });

  return {
    retrieval_query: retrievalQuery,
    top_k: topK,
    mode,
    alpha,
    candidate_count: candidates.length,
    candidates,
  };
}

/**
 * Извлекает retrieval_query и параметры поиска из входа контракта,
 * затем нормализует режим, top_k и alpha до допустимых значений.
 *
 * @param inputs Выходы предыдущих узлов пайплайна.
 * @param context Контекст выполнения текущего узла.
 * @returns Нормализованный вход для executor-а.
 * @throws {HttpError} Если retrieval_query отсутствует или пустой.
 */
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

  return {
    retrieval_query: retrievalQuery,
    top_k: resolveTopK(inputRecord.top_k ?? inputRecord.topK),
    mode: resolveMode(inputRecord.mode),
    alpha: resolveAlpha(inputRecord.alpha),
  };
}

/**
 * Определяет контракт HybridRetriever, его алиасы и допустимые executor-ы.
 */
export const hybridRetrieverToolContractDefinition: ToolContractDefinition = {
  name: 'HybridRetriever',
  aliases: ['hybridretriever', 'hybrid-retriever', 'hybrid_retriever'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveHybridRetrieverContractInput,
  buildHttpSuccessOutput: ({ input }) => buildHybridRetrieverContractOutput(input),
};
