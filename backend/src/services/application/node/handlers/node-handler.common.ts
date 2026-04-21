import { HttpError } from '../../../../common/http-error.js';
import type { DatasetContext, NodeExecutionContext, NodeHandlerResult, RuntimeNode } from '../../pipeline/pipeline.executor.types.js';
import { buildPrompt, toText } from '../../pipeline/pipeline.executor.utils.js';

const MAX_EMBEDDING_INPUT_ITEMS = Number(process.env.EXECUTOR_EMBEDDING_MAX_INPUTS) > 0 ? Number(process.env.EXECUTOR_EMBEDDING_MAX_INPUTS) : 24;
const MAX_EMBEDDING_TEXT_LENGTH =
  Number(process.env.EXECUTOR_EMBEDDING_MAX_TEXT_LENGTH) > 0 ? Number(process.env.EXECUTOR_EMBEDDING_MAX_TEXT_LENGTH) : 1800;

function normalizeTextForEmbedding(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function truncateText(raw: string, maxLength = MAX_EMBEDDING_TEXT_LENGTH): string {
  if (raw.length <= maxLength) return raw;
  return raw.slice(0, maxLength);
}

function appendCandidateText(out: string[], value: unknown) {
  const text = normalizeTextForEmbedding(toText(value));
  if (!text) return;
  out.push(truncateText(text));
}

function collectTextFragments(value: unknown, out: string[], depth = 0) {
  if (out.length >= MAX_EMBEDDING_INPUT_ITEMS * 2) return;
  if (depth > 4) return;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    appendCandidateText(out, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) {
      collectTextFragments(item, out, depth + 1);
      if (out.length >= MAX_EMBEDDING_INPUT_ITEMS * 2) break;
    }
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const before = out.length;

  const textKeys = ['text', 'content', 'prompt', 'query', 'question', 'title', 'desc', 'description', 'snippet', 'body'];
  for (const key of textKeys) {
    if (record[key] !== undefined) {
      appendCandidateText(out, record[key]);
    }
  }

  const listKeys = ['documents', 'chunks', 'contexts', 'candidates', 'items', 'records'];
  for (const key of listKeys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      collectTextFragments(candidate, out, depth + 1);
    }
  }

  const nestedKeys = ['value', 'data', 'payload', 'output'];
  for (const key of nestedKeys) {
    if (!(key in record)) continue;
    collectTextFragments(record[key], out, depth + 1);
  }

  if (out.length === before && depth === 0) {
    appendCandidateText(out, value);
  }
}

function dedupeTexts(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeTextForEmbedding(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function readNestedField(record: unknown, fieldPath: string): unknown {
  if (!fieldPath) return undefined;
  const keys = fieldPath
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (keys.length === 0) return undefined;

  let cursor: any = record;
  for (const key of keys) {
    if (!cursor || typeof cursor !== 'object' || !(key in cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }

  return cursor;
}

function toFiniteNumber(raw: unknown): number | undefined {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function normalizeComparableText(raw: unknown): string {
  return normalizeTextForEmbedding(toText(raw)).toLowerCase();
}

type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';

function normalizeFilterOperator(raw: unknown): FilterOperator | undefined {
  if (typeof raw !== 'string') return undefined;
  const op = raw.trim().toLowerCase();
  if (op === 'eq' || op === '==' || op === '=') return 'eq';
  if (op === 'neq' || op === '!=' || op === '<>') return 'neq';
  if (op === 'gt' || op === '>') return 'gt';
  if (op === 'gte' || op === '>=') return 'gte';
  if (op === 'lt' || op === '<') return 'lt';
  if (op === 'lte' || op === '<=') return 'lte';
  if (op === 'contains' || op === 'includes') return 'contains';
  return undefined;
}

function parseOptionalPositiveInt(raw: unknown, max: number): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value > max ? max : value;
}

function compareFilterValue(actual: unknown, op: FilterOperator, expected: unknown): boolean {
  const actualNum = toFiniteNumber(actual);
  const expectedNum = toFiniteNumber(expected);

  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    if (actualNum === undefined || expectedNum === undefined) return false;
    if (op === 'gt') return actualNum > expectedNum;
    if (op === 'gte') return actualNum >= expectedNum;
    if (op === 'lt') return actualNum < expectedNum;
    return actualNum <= expectedNum;
  }

  if (op === 'contains') {
    const expectedText = normalizeComparableText(expected);
    if (!expectedText) return false;

    if (Array.isArray(actual)) {
      return actual.some((entry) => normalizeComparableText(entry) === expectedText);
    }

    return normalizeComparableText(actual).includes(expectedText);
  }

  if (actualNum !== undefined && expectedNum !== undefined) {
    return op === 'eq' ? actualNum === expectedNum : actualNum !== expectedNum;
  }

  const actualText = normalizeComparableText(actual);
  const expectedText = normalizeComparableText(expected);
  return op === 'eq' ? actualText === expectedText : actualText !== expectedText;
}

function tokenizeText(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
    .slice(0, 128);
}

function scoreTextOverlap(query: string, candidate: string): number {
  const queryTokens = tokenizeText(query);
  if (queryTokens.length === 0) return 0;

  const candidateTokens = new Set(tokenizeText(candidate));
  if (candidateTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }

  return overlap / queryTokens.length;
}

function resolveRankerCandidateText(item: unknown, textField: string): string {
  const fromField = readNestedField(item, textField);
  const text = fromField !== undefined ? toText(fromField) : toText(item);
  return normalizeTextForEmbedding(text);
}

function resolveCandidateCollection(value: unknown): any[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, any>;
  const keys = ['items', 'candidates', 'documents', 'chunks', 'records', 'results', 'matches'];
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }

  const nestedKeys = ['value', 'data', 'payload', 'output'];
  for (const key of nestedKeys) {
    if (!(key in record)) continue;
    const nested = resolveCandidateCollection(record[key]);
    if (nested) return nested;
  }

  return null;
}

export function toObjectRecord(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, any>;
}

export function normalizeToolLookupKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function resolveNodeSectionConfig(runtime: RuntimeNode, section: string): Record<string, any> {
  const fromType = runtime.config && typeof runtime.config === 'object' ? runtime.config[section] : undefined;
  const nodeUi = runtime.node.ui_json && typeof runtime.node.ui_json === 'object' ? runtime.node.ui_json : {};
  const fromNode = nodeUi[section];

  const typeConfig = fromType && typeof fromType === 'object' ? fromType : {};
  const nodeConfig = fromNode && typeof fromNode === 'object' ? fromNode : {};
  return {
    ...typeConfig,
    ...nodeConfig,
  };
}

export function resolveQueryText(inputs: any[], inputJson: any, dataset: DatasetContext | null): string {
  const fromPrompt = normalizeTextForEmbedding(buildPrompt(inputs, inputJson));
  if (fromPrompt) return truncateText(fromPrompt);

  const fromInput = normalizeTextForEmbedding(toText(inputJson));
  if (fromInput) return truncateText(fromInput);

  const fromDataset = normalizeTextForEmbedding(dataset?.desc ?? dataset?.uri ?? '');
  if (fromDataset) return truncateText(fromDataset);

  return '';
}

export function extractCandidateItems(inputs: any[], inputJson: any): any[] {
  const out: any[] = [];
  const sources = inputs.length > 0 ? inputs : inputJson !== undefined ? [inputJson] : [];

  for (const source of sources) {
    const collection = resolveCandidateCollection(source);
    if (collection) {
      out.push(...collection);
      continue;
    }

    if (source !== undefined && source !== null) {
      out.push(source);
    }
  }

  return out;
}

export function resolveAgentChatModel(runtime: RuntimeNode): string | undefined {
  const fromAgent = runtime.config?.agent?.modelId;
  if (typeof fromAgent === 'string' && fromAgent.trim().length > 0) return fromAgent;

  const fromNodeLlm = runtime.config?.llm?.modelId;
  if (typeof fromNodeLlm === 'string' && fromNodeLlm.trim().length > 0) return fromNodeLlm;

  const fromToolLlm = runtime.tool?.config_json?.llm?.modelId;
  if (typeof fromToolLlm === 'string' && fromToolLlm.trim().length > 0) return fromToolLlm;

  return undefined;
}

export async function runFilterNode(runtime: RuntimeNode, inputs: any[], context: NodeExecutionContext): Promise<NodeHandlerResult> {
  const filterConfig = resolveNodeSectionConfig(runtime, 'filter');
  const fieldPath = typeof filterConfig.field === 'string' ? filterConfig.field.trim() : '';
  const operator = normalizeFilterOperator(filterConfig.op);
  const expectedValue = filterConfig.value;

  if ((fieldPath && !operator) || (!fieldPath && operator)) {
    throw new HttpError(400, {
      code: 'EXECUTOR_FILTER_CONFIG_INVALID',
      error: 'filter node requires both field and op when filter rule is configured',
    });
  }

  if (operator && expectedValue === undefined) {
    throw new HttpError(400, {
      code: 'EXECUTOR_FILTER_CONFIG_INVALID',
      error: 'filter node requires value when filter rule is configured',
    });
  }

  const rawItems = extractCandidateItems(inputs, context.input_json);
  const filtered =
    fieldPath && operator
      ? rawItems.filter((item) => compareFilterValue(readNestedField(item, fieldPath), operator, expectedValue))
      : rawItems;

  const limit = parseOptionalPositiveInt(filterConfig.limit, 10_000);
  const finalItems = limit ? filtered.slice(0, limit) : filtered;

  return {
    output: {
      kind: 'filter',
      total_items: rawItems.length,
      kept_items: finalItems.length,
      dropped_items: rawItems.length - finalItems.length,
      ...(fieldPath && operator
        ? {
            rule: {
              field: fieldPath,
              op: operator,
              value: expectedValue,
            },
          }
        : { rule: null }),
      items: finalItems,
    },
    costUnits: 0,
  };
}

export async function runRankerNode(runtime: RuntimeNode, inputs: any[], context: NodeExecutionContext): Promise<NodeHandlerResult> {
  const rankerConfig = resolveNodeSectionConfig(runtime, 'ranker');
  const scoreField =
    typeof rankerConfig.scoreField === 'string' && rankerConfig.scoreField.trim().length > 0
      ? rankerConfig.scoreField.trim()
      : 'score';
  const textField =
    typeof rankerConfig.textField === 'string' && rankerConfig.textField.trim().length > 0
      ? rankerConfig.textField.trim()
      : 'text';
  const order = typeof rankerConfig.order === 'string' && rankerConfig.order.trim().toLowerCase() === 'asc' ? 'asc' : 'desc';

  const runtimeTopK = parseOptionalPositiveInt(runtime.node.top_k, 10_000) ?? 5;
  const topK = parseOptionalPositiveInt(rankerConfig.topK, 10_000) ?? runtimeTopK;
  const configuredQuery = typeof rankerConfig.query === 'string' ? normalizeTextForEmbedding(rankerConfig.query) : '';
  const queryText = configuredQuery || resolveQueryText(inputs, context.input_json, context.dataset);

  const rawItems = extractCandidateItems(inputs, context.input_json);
  const ranked = rawItems
    .map((item, index) => {
      const numericScore = toFiniteNumber(readNestedField(item, scoreField));
      const candidateText = resolveRankerCandidateText(item, textField);
      const textScore = queryText ? scoreTextOverlap(queryText, candidateText) : 0;
      const finalScore = numericScore !== undefined ? numericScore + textScore * 0.001 : textScore;

      return {
        item,
        source_index: index,
        score: finalScore,
        numeric_score: numericScore,
        text_score: textScore,
      };
    })
    .sort((a, b) => {
      const delta = order === 'asc' ? a.score - b.score : b.score - a.score;
      if (delta !== 0) return delta;
      return a.source_index - b.source_index;
    });

  const selected = ranked.slice(0, topK);

  return {
    output: {
      kind: 'ranker',
      total_items: rawItems.length,
      returned_items: selected.length,
      top_k: topK,
      order,
      score_field: scoreField,
      query: queryText || null,
      items: selected.map((entry) => entry.item),
      ranking: selected.map((entry, index) => ({
        rank: index + 1,
        score: entry.score,
        source_index: entry.source_index,
        ...(entry.numeric_score !== undefined ? { numeric_score: entry.numeric_score } : {}),
        ...(queryText ? { text_score: entry.text_score } : {}),
      })),
    },
    costUnits: 0,
  };
}

export function mergeInputJson(base: unknown, patch: Record<string, any>): any {
  if (Object.keys(patch).length === 0) return base;
  const baseRecord = toObjectRecord(base);
  if (!baseRecord) {
    return { ...patch };
  }
  return {
    ...baseRecord,
    ...patch,
  };
}

export function stringifyForAgent(value: unknown, maxLength = 8_000): string {
  let text = '';
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value ?? '');
  }

  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 15))}...(truncated)`;
}

export function buildEmbeddingCandidates(inputs: any[], inputJson: any, dataset: DatasetContext | null): string[] {
  const raw: string[] = [];
  for (const input of inputs) {
    collectTextFragments(input, raw);
    if (raw.length >= MAX_EMBEDDING_INPUT_ITEMS * 2) break;
  }

  if (raw.length === 0) {
    collectTextFragments(inputJson, raw);
  }

  if (dataset) {
    appendCandidateText(raw, dataset.desc ?? '');
    appendCandidateText(raw, dataset.uri);
  }

  return dedupeTexts(raw).slice(0, MAX_EMBEDDING_INPUT_ITEMS);
}
