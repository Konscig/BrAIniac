import { HttpError } from '../../../common/http-error.js';
import { getOpenRouterAdapter } from '../../core/openrouter/openrouter.adapter.js';
import { getToolById } from '../../data/tool.service.js';
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
  source: 'node.tool' | 'node.tool_id' | 'node_type.tool';
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
  if (depth > 2) return;

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

function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;

  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i += 1) {
    const av = Number(a[i]);
    const bv = Number(b[i]);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

type RankedEmbeddingMatch = {
  rank: number;
  score: number;
  text: string;
};

function rankEmbeddingMatches(queryVector: number[], candidateTexts: string[], vectors: number[][], topK: number): RankedEmbeddingMatch[] {
  const scored: RankedEmbeddingMatch[] = [];
  const usableCount = Math.min(candidateTexts.length, vectors.length);

  for (let i = 0; i < usableCount; i += 1) {
    const score = cosineSimilarity(queryVector, vectors[i]!);
    scored.push({
      rank: i + 1,
      score,
      text: candidateTexts[i]!,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((item, index) => ({ ...item, rank: index + 1 }));
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

function normalizeToolExecutorKind(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!value) return 'local';

  if (value === 'http' || value === 'http-json' || value === 'webhook') return 'http-json';
  if (value === 'openrouter-chat' || value === 'chat' || value === 'llm') return 'openrouter-chat';
  if (value === 'openrouter-embeddings' || value === 'embeddings' || value === 'embed') return 'openrouter-embeddings';
  if (value === 'local' || value === 'passthrough' || value === 'noop') return 'local';

  return value;
}

function resolveToolExecutorConfig(toolConfig: any): { kind: string; options: Record<string, any> } {
  if (!toolConfig || typeof toolConfig !== 'object') {
    return { kind: 'local', options: {} };
  }

  if (typeof toolConfig.executor === 'string') {
    return { kind: normalizeToolExecutorKind(toolConfig.executor), options: {} };
  }

  if (toolConfig.executor && typeof toolConfig.executor === 'object') {
    const options = toolConfig.executor as Record<string, any>;
    return {
      kind: normalizeToolExecutorKind(options.kind ?? toolConfig.runtime),
      options,
    };
  }

  return {
    kind: normalizeToolExecutorKind(toolConfig.runtime),
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

  if (runtime.tool) {
    const fallbackConfig = runtime.tool.config_json ?? {};
    const fallbackExecutor = resolveToolExecutorConfig(fallbackConfig);
    const hasFallbackExecutor =
      fallbackExecutor.kind !== 'local' || fallbackConfig.executor !== undefined || fallbackConfig.runtime !== undefined;

    if (hasFallbackExecutor) {
      return {
        tool_id: runtime.tool.tool_id,
        name: runtime.tool.name,
        config_json: fallbackConfig,
        source: 'node_type.tool',
      };
    }
  }

  throw new HttpError(400, {
    code: 'EXECUTOR_TOOLNODE_TOOL_REQUIRED',
    error: 'tool node requires ui_json.tool_id or ui_json.tool with execution config',
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

      const { kind: executorKind, options: executorOptions } = resolveToolExecutorConfig(mergedToolConfig);
      const toolPayload = {
        tool: {
          tool_id: toolBinding.tool_id,
          name: toolBinding.name,
          source: toolBinding.source,
        },
        node: {
          node_id: runtime.node.node_id,
          top_k: runtime.node.top_k,
        },
        input: {
          inputs,
          input_json: context.input_json ?? null,
          dataset: context.dataset ?? null,
        },
      };

      if (executorKind === 'openrouter-chat') {
        const adapter = getOpenRouterAdapter();
        const model =
          typeof executorOptions.model === 'string' && executorOptions.model.trim().length > 0
            ? executorOptions.model
            : typeof mergedToolConfig.llm?.modelId === 'string' && mergedToolConfig.llm.modelId.trim().length > 0
            ? mergedToolConfig.llm.modelId
            : undefined;

        const configuredSystemPrompt =
          typeof executorOptions.systemPrompt === 'string' && executorOptions.systemPrompt.trim().length > 0
            ? executorOptions.systemPrompt
            : typeof mergedToolConfig.systemPrompt === 'string' && mergedToolConfig.systemPrompt.trim().length > 0
            ? mergedToolConfig.systemPrompt
            : `You are running tool \"${toolBinding.name}\" inside a pipeline ToolNode.`;

        const prompt = buildPrompt(inputs, context.input_json).trim();
        const completion = await adapter.chatCompletion({
          ...(model ? { model } : {}),
          messages: [
            { role: 'system', content: configuredSystemPrompt },
            {
              role: 'user',
              content: prompt.length > 0 ? prompt : JSON.stringify(toolPayload),
            },
          ],
          ...(Number.isFinite(Number(executorOptions.temperature))
            ? { temperature: Number(executorOptions.temperature) }
            : {}),
          ...(Number.isInteger(Number(executorOptions.maxTokens)) && Number(executorOptions.maxTokens) > 0
            ? { maxTokens: Number(executorOptions.maxTokens) }
            : {}),
        });

        return {
          output: {
            kind: 'tool_node',
            executor: 'openrouter-chat',
            tool_name: toolBinding.name,
            tool_id: toolBinding.tool_id,
            tool_source: toolBinding.source,
            model: completion.model,
            text: completion.text,
            usage: completion.usage ?? null,
          },
          costUnits: 1,
        };
      }

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

        return {
          output: {
            kind: 'tool_node',
            executor: 'openrouter-embeddings',
            tool_name: toolBinding.name,
            tool_id: toolBinding.tool_id,
            tool_source: toolBinding.source,
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

        return {
          output: {
            kind: 'tool_node',
            executor: 'http-json',
            tool_name: toolBinding.name,
            tool_id: toolBinding.tool_id,
            tool_source: toolBinding.source,
            status: response.status,
            response: responseBody,
          },
          costUnits: 1,
        };
      }

      if (executorKind === 'local') {
        return {
          output: {
            kind: 'tool_node',
            executor: 'local',
            tool_name: toolBinding.name,
            tool_id: toolBinding.tool_id,
            tool_source: toolBinding.source,
            request: toolPayload,
            note: 'local executor mode has no external runtime binding; payload echoed as stub result',
          },
          costUnits: 0,
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
  const handler = NODE_HANDLER_REGISTRY.get(runtime.nodeType.name);
  if (handler) {
    return handler(runtime, inputs, context);
  }

  return {
    output: {
      kind: 'not_implemented',
      node_type: runtime.nodeType.name,
      message: 'handler is not implemented in current executor mvp',
      received_inputs: inputs.length,
    },
    costUnits: 0,
  };
}
