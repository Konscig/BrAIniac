import { HttpError } from '../../../../common/http-error.js';
import type { NodeExecutionContext } from '../../pipeline/pipeline.executor.types.js';
import type { ToolContractDefinition } from './tool-contract.types.js';

const MAX_QUERY_BUILDER_TERMS = 64;

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

function extractQueryText(value: unknown): string | undefined {
  const unwrapped = unwrapPayload(value);

  const direct = readNonEmptyText(unwrapped);
  if (direct) return direct;

  if (!unwrapped || typeof unwrapped !== 'object') return undefined;

  const record = unwrapped as Record<string, unknown>;
  const queryKeys = ['user_query', 'query', 'question', 'prompt', 'text', 'content'];
  for (const key of queryKeys) {
    const text = readNonEmptyText(record[key]);
    if (text) return text;
  }

  return undefined;
}

function tokenizeQuery(raw: string): string[] {
  const matches = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!matches) return [];
  return matches.filter((token) => token.length > 1);
}

function buildQueryBuilderContractOutput(input: Record<string, any>): Record<string, any> {
  const normalizedQuery = normalizeText(String(input.user_query ?? ''));
  const maxTerms = coerceOptionalPositiveInt(input.max_terms) ?? 8;
  const safeMaxTerms = maxTerms > MAX_QUERY_BUILDER_TERMS ? MAX_QUERY_BUILDER_TERMS : maxTerms;

  const keywords: string[] = [];
  for (const token of tokenizeQuery(normalizedQuery)) {
    if (keywords.length >= safeMaxTerms) break;
    if (!keywords.includes(token)) {
      keywords.push(token);
    }
  }

  return {
    normalized_query: normalizedQuery,
    query_mode: 'keyword',
    keyword_count: keywords.length,
    keywords,
  };
}

export function resolveQueryBuilderContractInput(inputs: any[], context: NodeExecutionContext): Record<string, any> {
  const fromInputJson = extractQueryText(context.input_json);
  const fromInputs = fromInputJson
    ? undefined
    : inputs.map((entry) => extractQueryText(entry)).find((entry) => typeof entry === 'string' && entry.length > 0);

  const userQuery = fromInputJson ?? fromInputs;
  if (!userQuery) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_INPUT_INVALID',
      error: 'QueryBuilder contract requires non-empty user_query',
      details: { contract: 'QueryBuilder' },
    });
  }

  const inputRecord = context.input_json && typeof context.input_json === 'object' ? (context.input_json as Record<string, unknown>) : {};
  const limit = coerceOptionalPositiveInt(inputRecord.max_terms ?? inputRecord.maxTerms);

  return {
    user_query: userQuery,
    ...(limit ? { max_terms: limit > MAX_QUERY_BUILDER_TERMS ? MAX_QUERY_BUILDER_TERMS : limit } : {}),
  };
}

export const queryBuilderToolContractDefinition: ToolContractDefinition = {
  name: 'QueryBuilder',
  aliases: ['querybuilder', 'query-builder', 'query_builder'],
  allowedExecutors: ['http-json'],
  resolveInput: resolveQueryBuilderContractInput,
  buildHttpSuccessOutput: ({ input }) => buildQueryBuilderContractOutput(input),
};
