import { HttpError } from '../../../common/http-error.js';
import { getOpenRouterAdapter } from '../../core/openrouter/openrouter.adapter.js';
import { getToolById } from '../../data/tool.service.js';
import { listSupportedToolContracts, resolveToolContractDefinition } from '../tool/contracts/index.js';
import type { ResolvedToolContract, ToolContractDefinition, ToolExecutorKind } from '../tool/contracts/tool-contract.types.js';
import type { DatasetContext, NodeExecutionContext, NodeHandler, NodeHandlerResult, RuntimeNode } from './pipeline.executor.types.js';
import {
  buildPrompt,
  nowIso,
  readBoundedInteger,
  readPositiveInteger,
  toText,
  tryParseJsonFromText,
} from './pipeline.executor.utils.js';

const MAX_EMBEDDING_INPUT_ITEMS = readPositiveInteger(process.env.EXECUTOR_EMBEDDING_MAX_INPUTS, 24);
const MAX_EMBEDDING_TEXT_LENGTH = readPositiveInteger(process.env.EXECUTOR_EMBEDDING_MAX_TEXT_LENGTH, 1_800);

type ResolvedToolBinding = {
  tool_id: number | null;
  name: string;
  config_json: any;
  source: 'node.tool' | 'node.tool_id';
};

type ResolvedToolExecutorConfig = {
  kind: ToolExecutorKind | undefined;
  rawKind: string | undefined;
  options: Record<string, any>;
};

type ResolvedToolContractSelector = {
  definition: ToolContractDefinition | undefined;
  rawName: string | undefined;
  explicit: boolean;
};

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

function resolveQueryText(inputs: any[], inputJson: any, dataset: DatasetContext | null): string {
  const fromPrompt = normalizeTextForEmbedding(buildPrompt(inputs, inputJson));
  if (fromPrompt) return truncateText(fromPrompt);

  const fromInput = normalizeTextForEmbedding(toText(inputJson));
  if (fromInput) return truncateText(fromInput);

  const fromDataset = normalizeTextForEmbedding(dataset?.desc ?? dataset?.uri ?? '');
  if (fromDataset) return truncateText(fromDataset);

  return '';
}

function buildEmbeddingCandidates(inputs: any[], inputJson: any, dataset: DatasetContext | null): string[] {
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

function resolveNodeSectionConfig(runtime: RuntimeNode, section: string): Record<string, any> {
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
    if (nested) {
      return nested;
    }
  }

  return null;
}

function extractCandidateItems(inputs: any[], inputJson: any): any[] {
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

async function runFilterNode(runtime: RuntimeNode, inputs: any[], context: NodeExecutionContext): Promise<NodeHandlerResult> {
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

async function runRankerNode(runtime: RuntimeNode, inputs: any[], context: NodeExecutionContext): Promise<NodeHandlerResult> {
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

function resolveEmbeddingModel(runtime: RuntimeNode): string | undefined {
  const fromNodeEmbedding = runtime.config?.embedding?.modelId;
  if (typeof fromNodeEmbedding === 'string' && fromNodeEmbedding.trim().length > 0) return fromNodeEmbedding;

  const fromAgent = runtime.config?.agent?.embeddingModel;
  if (typeof fromAgent === 'string' && fromAgent.trim().length > 0) return fromAgent;

  const fromTool = runtime.tool?.config_json?.embedding?.modelId;
  if (typeof fromTool === 'string' && fromTool.trim().length > 0) return fromTool;

  return undefined;
}

function resolveAgentChatModel(runtime: RuntimeNode): string | undefined {
  const fromAgent = runtime.config?.agent?.modelId;
  if (typeof fromAgent === 'string' && fromAgent.trim().length > 0) return fromAgent;

  const fromNodeLlm = runtime.config?.llm?.modelId;
  if (typeof fromNodeLlm === 'string' && fromNodeLlm.trim().length > 0) return fromNodeLlm;

  const fromToolLlm = runtime.tool?.config_json?.llm?.modelId;
  if (typeof fromToolLlm === 'string' && fromToolLlm.trim().length > 0) return fromToolLlm;

  return undefined;
}

function coerceOptionalPositiveInt(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function sanitizeStringRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const headerName = key.trim();
    if (!headerName) continue;
    out[headerName] = value;
  }

  return out;
}

function resolveToolContractSelector(toolName: string, toolConfig: any): ResolvedToolContractSelector {
  if (!toolConfig || typeof toolConfig !== 'object') {
    return {
      definition: resolveToolContractDefinition(toolName),
      rawName: undefined,
      explicit: false,
    };
  }

  const rawContract = toolConfig.contract;
  if (typeof rawContract === 'string') {
    const rawName = rawContract.trim();
    return {
      definition: resolveToolContractDefinition(rawName),
      rawName: rawName || undefined,
      explicit: rawName.length > 0,
    };
  }

  if (rawContract && typeof rawContract === 'object') {
    const options = rawContract as Record<string, any>;
    const rawSource = options.name ?? options.kind ?? options.type;
    const rawName = typeof rawSource === 'string' ? rawSource.trim() : '';
    return {
      definition: resolveToolContractDefinition(rawName),
      rawName: rawName || undefined,
      explicit: true,
    };
  }

  return {
    definition: resolveToolContractDefinition(toolName),
    rawName: undefined,
    explicit: false,
  };
}

function resolveToolContract(
  toolBinding: ResolvedToolBinding,
  mergedToolConfig: any,
  inputs: any[],
  context: NodeExecutionContext,
): ResolvedToolContract | null {
  const contractSelector = resolveToolContractSelector(toolBinding.name, mergedToolConfig);

  if (contractSelector.explicit && contractSelector.rawName && !contractSelector.definition) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_CONTRACT_UNSUPPORTED',
      error: `unsupported tool contract: ${contractSelector.rawName}`,
      details: {
        supported_contracts: listSupportedToolContracts(),
      },
    });
  }

  if (!contractSelector.definition) return null;

  return {
    name: contractSelector.definition.name,
    definition: contractSelector.definition,
    input: contractSelector.definition.resolveInput(inputs, context),
  };
}

function assertToolContractExecutorCompatibility(contract: ResolvedToolContract, executorKind: ToolExecutorKind) {
  const allowed = contract.definition.allowedExecutors;
  if (allowed.includes(executorKind)) return;

  throw new HttpError(400, {
    code: 'EXECUTOR_TOOLNODE_CONTRACT_EXECUTOR_MISMATCH',
    error: `${contract.name} contract is not supported for executor ${executorKind}`,
    details: {
      contract: contract.name,
      executor: executorKind,
      allowed_executors: allowed,
    },
  });
}

function normalizeToolExecutorKind(raw: unknown): ToolExecutorKind | undefined {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!value) return undefined;

  if (value === 'http' || value === 'http-json' || value === 'webhook') return 'http-json';
  if (value === 'openrouter-embeddings' || value === 'embeddings' || value === 'embed') return 'openrouter-embeddings';

  return undefined;
}

function resolveToolExecutorConfig(toolConfig: any): ResolvedToolExecutorConfig {
  if (!toolConfig || typeof toolConfig !== 'object') {
    return { kind: undefined, rawKind: undefined, options: {} };
  }

  if (typeof toolConfig.executor === 'string') {
    const rawKind = toolConfig.executor.trim();
    return {
      kind: normalizeToolExecutorKind(rawKind),
      rawKind: rawKind || undefined,
      options: {},
    };
  }

  if (toolConfig.executor && typeof toolConfig.executor === 'object') {
    const options = toolConfig.executor as Record<string, any>;
    const rawSource = options.kind ?? toolConfig.runtime;
    const rawKind = typeof rawSource === 'string' ? rawSource.trim() : '';
    return {
      kind: normalizeToolExecutorKind(rawKind),
      rawKind: rawKind || undefined,
      options,
    };
  }

  if (typeof toolConfig.runtime === 'string') {
    const rawKind = toolConfig.runtime.trim();
    return {
      kind: normalizeToolExecutorKind(rawKind),
      rawKind: rawKind || undefined,
      options: {},
    };
  }

  return {
    kind: undefined,
    rawKind: undefined,
    options: {},
  };
}

function listAgentToolBindings(runtime: RuntimeNode): Array<Record<string, any>> {
  const fromNode = runtime.node.ui_json?.tools;
  const fromConfig = runtime.config?.agent?.tools;
  const rawList = Array.isArray(fromNode) ? fromNode : Array.isArray(fromConfig) ? fromConfig : [];

  const normalized: Array<Record<string, any>> = [];
  for (const entry of rawList.slice(0, 20)) {
    if (!entry || typeof entry !== 'object') continue;

    const record = entry as Record<string, any>;
    const name =
      typeof record.name === 'string'
        ? record.name.trim()
        : typeof record.id === 'string'
        ? record.id.trim()
        : '';

    if (!name) continue;

    normalized.push({
      name,
      ...(typeof record.desc === 'string' && record.desc.trim().length > 0 ? { desc: record.desc.trim() } : {}),
      ...(record.schema && typeof record.schema === 'object' ? { schema: record.schema } : {}),
    });
  }

  return normalized;
}

async function resolveToolNodeBinding(runtime: RuntimeNode): Promise<ResolvedToolBinding> {
  const nodeUi = runtime.node.ui_json && typeof runtime.node.ui_json === 'object' ? runtime.node.ui_json : {};

  const inlineTool = nodeUi.tool;
  if (inlineTool && typeof inlineTool === 'object') {
    const name = typeof inlineTool.name === 'string' ? inlineTool.name.trim() : '';
    if (!name) {
      throw new HttpError(400, {
        code: 'EXECUTOR_TOOLNODE_TOOL_INVALID',
        error: 'tool node ui_json.tool.name is required',
      });
    }

    const inlineConfig =
      inlineTool.config_json !== undefined
        ? inlineTool.config_json
        : inlineTool.config !== undefined
        ? inlineTool.config
        : {};

    return {
      tool_id: coerceOptionalPositiveInt(inlineTool.tool_id) ?? null,
      name,
      config_json: inlineConfig,
      source: 'node.tool',
    };
  }

  const rawToolId = nodeUi.tool_id ?? nodeUi.toolId ?? nodeUi.fk_tool_id ?? nodeUi.target_tool_id;
  if (rawToolId !== undefined) {
    const toolId = coerceOptionalPositiveInt(rawToolId);
    if (!toolId) {
      throw new HttpError(400, {
        code: 'EXECUTOR_TOOLNODE_TOOL_INVALID',
        error: 'tool node ui_json.tool_id must be a positive integer',
      });
    }

    const linkedTool = await getToolById(toolId);
    if (!linkedTool) {
      throw new HttpError(404, {
        code: 'EXECUTOR_TOOLNODE_TOOL_NOT_FOUND',
        error: 'tool for tool node was not found',
        details: { tool_id: toolId },
      });
    }

    return {
      tool_id: linkedTool.tool_id,
      name: linkedTool.name,
      config_json: linkedTool.config_json ?? {},
      source: 'node.tool_id',
    };
  }

  throw new HttpError(400, {
    code: 'EXECUTOR_TOOLNODE_TOOL_REQUIRED',
    error: 'tool node requires explicit ui_json.tool_id or ui_json.tool binding',
  });
}

const NODE_HANDLER_REGISTRY = new Map<string, NodeHandler>([
  [
    'Trigger',
    async (_runtime, _inputs, context) => ({
      output: {
        kind: 'trigger',
        triggered_at: nowIso(),
        input: context.input_json ?? null,
      },
      costUnits: 0,
    }),
  ],
  [
    'ManualInput',
    async (_runtime, _inputs, context) => ({
      output: {
        kind: 'manual_input',
        value: context.input_json ?? null,
      },
      costUnits: 0,
    }),
  ],
  [
    'DatasetInput',
    async (_runtime, _inputs, context) => {
      if (!context.dataset) {
        throw new HttpError(400, {
          code: 'EXECUTOR_DATASET_REQUIRED',
          error: 'dataset input node requires dataset',
        });
      }

      return {
        output: {
          kind: 'dataset_input',
          ...context.dataset,
        },
        costUnits: 0,
      };
    },
  ],
  [
    'PromptBuilder',
    async (_runtime, inputs, context) => {
      const prompt = buildPrompt(inputs, context.input_json);
      return {
        output: {
          kind: 'prompt',
          prompt,
          part_count: inputs.length,
        },
        costUnits: 0,
      };
    },
  ],
  [
    'Filter',
    runFilterNode,
  ],
  [
    'Ranker',
    runRankerNode,
  ],
  [
    'LLMCall',
    async (runtime, inputs, context) => {
      const adapter = getOpenRouterAdapter();
      const llmConfig = runtime.config?.llm ?? runtime.tool?.config_json?.llm ?? {};

      const model = typeof llmConfig?.modelId === 'string' ? llmConfig.modelId : undefined;
      const temperatureRaw = Number(llmConfig?.temperature);
      const maxTokensRaw = Number(llmConfig?.maxTokens);

      const prompt = buildPrompt(inputs, context.input_json);
      const completion = await adapter.chatCompletion({
        ...(model ? { model } : {}),
        messages: [
          {
            role: 'user',
            content: prompt || 'Respond with a short status update.',
          },
        ],
        ...(Number.isFinite(temperatureRaw) ? { temperature: temperatureRaw } : {}),
        ...(Number.isInteger(maxTokensRaw) && maxTokensRaw > 0 ? { maxTokens: maxTokensRaw } : {}),
      });

      return {
        output: {
          kind: 'llm_response',
          provider: 'openrouter',
          model: completion.model,
          text: completion.text,
          usage: completion.usage ?? null,
        },
        costUnits: 1,
      };
    },
  ],
  [
    'AgentCall',
    async (runtime, inputs, context) => {
      const adapter = getOpenRouterAdapter();
      const prompt = buildPrompt(inputs, context.input_json).trim();
      if (!prompt) {
        throw new HttpError(400, {
          code: 'EXECUTOR_AGENTCALL_INPUT_REQUIRED',
          error: 'agent call requires non-empty input context',
        });
      }

      const maxToolCalls = readBoundedInteger(runtime.config?.agent?.maxToolCalls, 3, 1, 8);
      const availableTools = listAgentToolBindings(runtime);
      const toolText =
        availableTools.length > 0
          ? `Available tools:\n${availableTools
              .map((tool, index) => `${index + 1}. ${tool.name}${tool.desc ? ` - ${tool.desc}` : ''}`)
              .join('\n')}`
          : '';

      const maxAttempts = readBoundedInteger(runtime.config?.agent?.maxAttempts, 1, 1, 5);
      const agentModel = resolveAgentChatModel(runtime);
      const temperatureRaw = Number(runtime.config?.agent?.temperature ?? runtime.config?.llm?.temperature);
      const maxTokensRaw = Number(runtime.config?.agent?.maxTokens ?? runtime.config?.llm?.maxTokens);
      const configuredSystemPrompt = runtime.config?.agent?.systemPrompt;
      const systemPrompt =
        typeof configuredSystemPrompt === 'string' && configuredSystemPrompt.trim().length > 0
          ? configuredSystemPrompt
          : 'You are AgentCall runtime in a pipeline graph. Return concise, actionable output. Use JSON when structure is useful.';

      let attemptsUsed = 0;
      let finalText = '';
      let finalModel = agentModel ?? '';
      let finalUsage: Record<string, any> | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attemptsUsed = attempt;
        const completion = await adapter.chatCompletion({
          ...(agentModel ? { model: agentModel } : {}),
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `${toolText ? `${toolText}\n\n` : ''}Task:\n${prompt}`,
            },
          ],
          ...(Number.isFinite(temperatureRaw) ? { temperature: temperatureRaw } : {}),
          ...(Number.isInteger(maxTokensRaw) && maxTokensRaw > 0 ? { maxTokens: maxTokensRaw } : {}),
        });

        finalModel = completion.model;
        finalUsage = completion.usage;
        finalText = completion.text.trim();
        if (finalText.length > 0) break;
      }

      if (!finalText) {
        finalText = 'AgentCall completed with empty answer.';
      }

      const structuredOutput = tryParseJsonFromText(finalText);

      return {
        output: {
          kind: 'agent_call',
          provider: 'openrouter',
          model: finalModel,
          text: finalText,
          usage: finalUsage ?? null,
          attempts_used: attemptsUsed,
          max_attempts: maxAttempts,
          max_tool_calls: maxToolCalls,
          ...(availableTools.length > 0 ? { available_tools: availableTools } : {}),
          ...(structuredOutput !== null ? { structured_output: structuredOutput } : {}),
        },
        costUnits: Math.max(1, attemptsUsed),
      };
    },
  ],
  [
    'ToolNode',
    async (runtime, inputs, context) => {
      const nodeUi = runtime.node.ui_json && typeof runtime.node.ui_json === 'object' ? runtime.node.ui_json : {};
      const toolBinding = await resolveToolNodeBinding(runtime);
      const toolOverrides = nodeUi.toolConfig && typeof nodeUi.toolConfig === 'object' ? nodeUi.toolConfig : {};
      const mergedToolConfig = {
        ...(toolBinding.config_json && typeof toolBinding.config_json === 'object' ? toolBinding.config_json : {}),
        ...toolOverrides,
      };

      const {
        kind: executorKind,
        rawKind: rawExecutorKind,
        options: executorOptions,
      } = resolveToolExecutorConfig(mergedToolConfig);

      if (!rawExecutorKind) {
        throw new HttpError(400, {
          code: 'EXECUTOR_TOOLNODE_EXECUTOR_REQUIRED',
          error: 'tool node requires explicit executor kind (openrouter-embeddings, http-json)',
        });
      }

      if (!executorKind) {
        throw new HttpError(400, {
          code: 'EXECUTOR_TOOLNODE_EXECUTOR_UNSUPPORTED',
          error: `unsupported tool executor kind: ${rawExecutorKind}`,
        });
      }

      const toolContract = resolveToolContract(toolBinding, mergedToolConfig, inputs, context);
      if (toolContract) {
        assertToolContractExecutorCompatibility(toolContract, executorKind);
      }

      const toolPayload = {
        tool: {
          tool_id: toolBinding.tool_id,
          name: toolBinding.name,
          source: toolBinding.source,
        },
        ...(toolContract
          ? {
              contract: {
                name: toolContract.name,
              },
            }
          : {}),
        node: {
          node_id: runtime.node.node_id,
          top_k: runtime.node.top_k,
        },
        input: {
          inputs,
          input_json: context.input_json ?? null,
          dataset: context.dataset ?? null,
          ...(toolContract ? { contract_input: toolContract.input } : {}),
        },
      };

      if (executorKind === 'openrouter-embeddings') {
        const adapter = getOpenRouterAdapter();
        const inputTexts = buildEmbeddingCandidates(inputs, context.input_json, context.dataset);
        if (inputTexts.length === 0) {
          throw new HttpError(400, {
            code: 'EXECUTOR_TOOLNODE_INPUT_REQUIRED',
            error: 'tool node embeddings executor requires text input',
          });
        }

        const model =
          typeof executorOptions.model === 'string' && executorOptions.model.trim().length > 0
            ? executorOptions.model
            : typeof mergedToolConfig.embedding?.modelId === 'string' && mergedToolConfig.embedding.modelId.trim().length > 0
            ? mergedToolConfig.embedding.modelId
            : resolveEmbeddingModel(runtime);

        const embeddingResult = await adapter.embeddings({
          ...(model ? { model } : {}),
          input: inputTexts,
        });

        const contractOutput = toolContract?.definition.buildEmbeddingSuccessOutput?.({
          input: toolContract.input,
          model: embeddingResult.model,
          embeddings: embeddingResult.embeddings,
        });

        return {
          output: {
            kind: 'tool_node',
            executor: 'openrouter-embeddings',
            tool_name: toolBinding.name,
            tool_id: toolBinding.tool_id,
            tool_source: toolBinding.source,
            ...(toolContract ? { contract_name: toolContract.name } : {}),
            ...(contractOutput ? { contract_output: contractOutput } : {}),
            model: embeddingResult.model,
            input_items: inputTexts.length,
            embeddings: embeddingResult.embeddings,
          },
          costUnits: Math.max(1, Math.ceil(inputTexts.length / 8)),
        };
      }

      if (executorKind === 'http-json') {
        const rawUrl =
          typeof executorOptions.url === 'string' && executorOptions.url.trim().length > 0
            ? executorOptions.url
            : typeof mergedToolConfig.url === 'string' && mergedToolConfig.url.trim().length > 0
            ? mergedToolConfig.url
            : undefined;

        if (!rawUrl) {
          throw new HttpError(400, {
            code: 'EXECUTOR_TOOLNODE_HTTP_URL_REQUIRED',
            error: 'http-json tool executor requires url',
          });
        }

        let normalizedUrl = rawUrl;
        try {
          const parsedUrl = new URL(rawUrl);
          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('invalid protocol');
          }
          normalizedUrl = parsedUrl.toString();
        } catch {
          throw new HttpError(400, {
            code: 'EXECUTOR_TOOLNODE_HTTP_URL_INVALID',
            error: 'http-json tool executor url is invalid',
          });
        }

        const methodRaw =
          typeof executorOptions.method === 'string'
            ? executorOptions.method.toUpperCase()
            : typeof mergedToolConfig.method === 'string'
            ? mergedToolConfig.method.toUpperCase()
            : 'POST';
        const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methodRaw) ? methodRaw : 'POST';
        const timeoutMs = readBoundedInteger(executorOptions.timeoutMs ?? mergedToolConfig.timeoutMs, 10_000, 200, 120_000);

        const headers = {
          ...sanitizeStringRecord(mergedToolConfig.headers),
          ...sanitizeStringRecord(executorOptions.headers),
        };
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
          response = await fetch(normalizedUrl, {
            method,
            headers,
            ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(toolPayload) }),
            signal: controller.signal,
          });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new HttpError(504, {
              code: 'EXECUTOR_TOOLNODE_TIMEOUT',
              error: 'tool node executor timed out',
              details: { timeout_ms: timeoutMs },
            });
          }

          throw new HttpError(503, {
            code: 'EXECUTOR_TOOLNODE_UNAVAILABLE',
            error: 'tool node executor request failed',
          });
        } finally {
          clearTimeout(timeout);
        }

        const rawBody = await response.text();
        let responseBody: any = rawBody;
        if (rawBody) {
          try {
            responseBody = JSON.parse(rawBody);
          } catch {
            responseBody = rawBody;
          }
        } else {
          responseBody = null;
        }

        if (!response.ok) {
          throw new HttpError(502, {
            code: 'EXECUTOR_TOOLNODE_HTTP_ERROR',
            error: 'tool node executor returned non-success status',
            details: {
              status: response.status,
              body: responseBody,
            },
          });
        }

        const contractOutput = toolContract?.definition.buildHttpSuccessOutput?.({
          input: toolContract.input,
          status: response.status,
          response: responseBody,
        });

        return {
          output: {
            kind: 'tool_node',
            executor: 'http-json',
            tool_name: toolBinding.name,
            tool_id: toolBinding.tool_id,
            tool_source: toolBinding.source,
            ...(toolContract ? { contract_name: toolContract.name } : {}),
            ...(contractOutput ? { contract_output: contractOutput } : {}),
            status: response.status,
            response: responseBody,
          },
          costUnits: 1,
        };
      }

      throw new HttpError(400, {
        code: 'EXECUTOR_TOOLNODE_EXECUTOR_UNSUPPORTED',
        error: `unsupported tool executor kind: ${executorKind}`,
      });
    },
  ],
  [
    'Parser',
    async (_runtime, inputs, context) => {
      const source = inputs.length > 0 ? inputs[0] : context.input_json;
      const text = toText(source);
      const parsed = tryParseJsonFromText(text);
      return {
        output: {
          kind: 'parser',
          raw_text: text,
          parsed_json: parsed,
          parse_ok: parsed !== null,
        },
        costUnits: 0,
      };
    },
  ],
  [
    'SaveResult',
    async (_runtime, inputs) => ({
      output: {
        kind: 'save_result',
        saved_at: nowIso(),
        received_inputs: inputs.length,
        preview: inputs.length > 0 ? inputs[0] : null,
      },
      costUnits: 0,
    }),
  ],
]);

export async function executeNode(
  runtime: RuntimeNode,
  inputs: any[],
  context: NodeExecutionContext,
): Promise<NodeHandlerResult> {
  const rawNodeTypeName = typeof runtime.nodeType.name === 'string' ? runtime.nodeType.name : '';
  const nodeTypeName = rawNodeTypeName.trim();

  const handler = NODE_HANDLER_REGISTRY.get(nodeTypeName);
  if (handler) {
    return handler(runtime, inputs, context);
  }

  return {
    output: {
      kind: 'not_implemented',
      node_type: nodeTypeName || rawNodeTypeName,
      message: 'handler is not implemented in current executor mvp',
      received_inputs: inputs.length,
    },
    costUnits: 0,
  };
}
