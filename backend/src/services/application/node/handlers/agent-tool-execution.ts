import { HttpError, isHttpError } from '../../../../common/http-error.js';
import { getOpenRouterAdapter } from '../../../core/openrouter/openrouter.adapter.js';
import { getToolById } from '../../../data/tool.service.js';
import { listSupportedToolContracts, resolveToolContractDefinition } from '../../tool/contracts/index.js';
import type { ResolvedToolContract, ToolContractDefinition, ToolExecutorKind } from '../../tool/contracts/tool-contract.types.js';
import type { NodeExecutionContext, NodeHandlerResult, RuntimeNode } from '../../pipeline/pipeline.executor.types.js';
import { readBoundedInteger } from '../../pipeline/pipeline.executor.utils.js';
import { buildEmbeddingCandidates, toObjectRecord } from './node-handler.common.js';

const ENABLE_LOCAL_SYNTHETIC_CONTRACT_OUTPUT = (process.env.EXECUTOR_ALLOW_LOCAL_CONTRACT_OUTPUT ?? '0').trim() === '1';

/** Признак того, что URL указывает на наш собственный /tool-executor/contracts
 *  endpoint. Используется short-circuit-ом, который при положительном ответе
 *  вызывает contract.buildHttpSuccessOutput напрямую (in-process) вместо
 *  fetch-roundtrip к localhost. Принимаем только точный path и только
 *  localhost/127.0.0.1 — внешние URL по-прежнему идут через fetch. */
function isLocalSelfContractsUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0' && host !== '::1') return false;
    if (url.pathname.replace(/\/+$/, '') !== '/tool-executor/contracts') return false;
    return true;
  } catch {
    return false;
  }
}

/** SSRF deny-list для external http-json fetch. Блокирует:
 *  - loopback (127.0.0.0/8, ::1)
 *  - link-local (169.254.0.0/16 — AWS/GCP metadata; fe80::/10)
 *  - private RFC1918 (10/8, 172.16/12, 192.168/16) и IPv6 ULA (fc00::/7)
 *  - cloud metadata-домены и broadcast (0.0.0.0).
 *  Override через EXECUTOR_HTTP_JSON_ALLOW_PRIVATE=1 (для разработки локально).
 *
 *  Поскольку `toolConfig.url` хранится в `node.tool.config_json` / `ui_json.toolConfig`
 *  и доступен пользователю через MCP-tools обновления узла, без этой проверки
 *  атакующий мог бы заставить backend ходить к AWS metadata-сервису или
 *  внутренним SaaS-сервисам сети.
 *
 *  Анти-DNS-rebinding делается отдельно: мы резолвим hostname и проверяем
 *  все возвращённые IP перед connect-ом. */
const ALLOW_PRIVATE_URLS = (process.env.EXECUTOR_HTTP_JSON_ALLOW_PRIVATE ?? '0').trim() === '1';

function isBlockedIpLiteral(hostname: string): boolean {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  // bracketed IPv6
  const v6 = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  if (v6 === '::1' || v6 === '::' || v6 === '0:0:0:0:0:0:0:1') return true;
  if (v6.startsWith('fe80:') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true; // link-local
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // ULA fc00::/7
  // IPv4-mapped IPv6
  const v4m = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4m) return isPrivateIPv4(v4m[1]!);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIPv4(h);
  return false;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF
  if (a === 224) return true; // multicast
  if (a >= 240) return true; // reserved
  return false;
}

const BLOCKED_METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata',
  'instance-data',
  'instance-data.ec2.internal',
]);

async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_HTTP_URL_INVALID',
      error: 'http-json tool executor url is invalid',
    });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_HTTP_URL_INVALID',
      error: 'only http(s) protocols allowed',
    });
  }
  if (ALLOW_PRIVATE_URLS) return url;

  const host = url.hostname.toLowerCase();
  if (BLOCKED_METADATA_HOSTS.has(host)) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_HTTP_URL_FORBIDDEN',
      error: 'metadata host is not allowed',
      details: { host },
    });
  }
  if (host === 'localhost' || isBlockedIpLiteral(host)) {
    throw new HttpError(400, {
      code: 'EXECUTOR_TOOLNODE_HTTP_URL_FORBIDDEN',
      error: 'loopback / private / link-local addresses are not allowed for external http-json',
      details: { host },
    });
  }

  // Anti-DNS-rebinding: resolve hostname и проверим IP-литералы.
  // Используем dynamic import для node:dns/promises чтобы избежать top-level
  // зависимости в типе для не-серверной сборки.
  try {
    const { lookup } = await import('node:dns/promises');
    const records = await lookup(host, { all: true });
    for (const rec of records) {
      if (isBlockedIpLiteral(rec.address)) {
        throw new HttpError(400, {
          code: 'EXECUTOR_TOOLNODE_HTTP_URL_FORBIDDEN',
          error: 'DNS resolves to a blocked address',
          details: { host, address: rec.address },
        });
      }
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // dns lookup failed — пусть fetch сам упадёт; не блокируем
  }
  return url;
}

export type ResolvedToolBinding = {
  tool_id: number | null;
  name: string;
  config_json: any;
  source: 'node.tool' | 'node.tool_id';
};

export type ExecuteResolvedToolBindingOptions = {
  toolConfigOverride?: Record<string, any>;
  nodeId?: number;
  topK?: number;
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

function resolveEmbeddingModel(runtime: RuntimeNode): string | undefined {
  const fromNodeEmbedding = runtime.config?.embedding?.modelId;
  if (typeof fromNodeEmbedding === 'string' && fromNodeEmbedding.trim().length > 0) return fromNodeEmbedding;

  const fromAgent = runtime.config?.agent?.embeddingModel;
  if (typeof fromAgent === 'string' && fromAgent.trim().length > 0) return fromAgent;

  const fromTool = runtime.tool?.config_json?.embedding?.modelId;
  if (typeof fromTool === 'string' && fromTool.trim().length > 0) return fromTool;

  return undefined;
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
    input: contractSelector.definition.resolveInput(inputs, context, mergedToolConfig),
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

function resolveToolExecutorConfig(toolConfig: any): ResolvedToolExecutorConfig {
  const executor = toolConfig?.executor;
  if (typeof executor === 'string') {
    const rawKind = executor.trim();
    const normalizedKind = rawKind.toLowerCase();
    const options = {
      kind: rawKind,
      ...(typeof toolConfig?.url === 'string' ? { url: toolConfig.url } : {}),
      ...(typeof toolConfig?.method === 'string' ? { method: toolConfig.method } : {}),
      ...(toolConfig?.headers && typeof toolConfig.headers === 'object' ? { headers: toolConfig.headers } : {}),
      ...(toolConfig?.timeoutMs !== undefined ? { timeoutMs: toolConfig.timeoutMs } : {}),
    };

    if (normalizedKind === 'openrouter-embeddings' || normalizedKind === 'http-json') {
      return {
        kind: normalizedKind,
        rawKind,
        options,
      };
    }

    return {
      kind: undefined,
      rawKind,
      options,
    };
  }

  if (!executor || typeof executor !== 'object') {
    return {
      kind: undefined,
      rawKind: undefined,
      options: {},
    };
  }

  const options = executor as Record<string, any>;
  const rawKind = typeof options.kind === 'string' ? options.kind.trim() : undefined;
  const normalizedKind = rawKind?.toLowerCase();
  if (normalizedKind === 'openrouter-embeddings' || normalizedKind === 'http-json') {
    return {
      kind: normalizedKind,
      rawKind,
      options,
    };
  }

  return {
    kind: undefined,
    rawKind,
    options,
  };
}

export async function resolveToolNodeBinding(runtime: RuntimeNode): Promise<ResolvedToolBinding> {
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
      inlineTool.config_json !== undefined ? inlineTool.config_json : inlineTool.config !== undefined ? inlineTool.config : {};
    const inlineToolId = coerceOptionalPositiveInt(inlineTool.tool_id);

    if (inlineToolId) {
      const linkedTool = await getToolById(inlineToolId);
      if (!linkedTool) {
        throw new HttpError(404, {
          code: 'EXECUTOR_TOOLNODE_TOOL_NOT_FOUND',
          error: 'tool for tool node was not found',
          details: { tool_id: inlineToolId },
        });
      }

      const linkedName = typeof linkedTool.name === 'string' && linkedTool.name.trim().length > 0 ? linkedTool.name.trim() : name;
      const linkedConfig = linkedTool.config_json && typeof linkedTool.config_json === 'object' ? linkedTool.config_json : {};

      return {
        tool_id: inlineToolId,
        name: linkedName,
        config_json: linkedConfig,
        source: 'node.tool_id',
      };
    }

    return {
      tool_id: null,
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

export async function executeResolvedToolBinding(
  runtime: RuntimeNode,
  toolBinding: ResolvedToolBinding,
  inputs: any[],
  context: NodeExecutionContext,
  options: ExecuteResolvedToolBindingOptions = {},
): Promise<NodeHandlerResult> {
  const nodeUi = runtime.node.ui_json && typeof runtime.node.ui_json === 'object' ? runtime.node.ui_json : {};
  const nodeToolOverrides = nodeUi.toolConfig && typeof nodeUi.toolConfig === 'object' ? nodeUi.toolConfig : {};
  const overrideRecord = options.toolConfigOverride && typeof options.toolConfigOverride === 'object' ? options.toolConfigOverride : {};
  const mergedToolConfig = {
    ...(toolBinding.config_json && typeof toolBinding.config_json === 'object' ? toolBinding.config_json : {}),
    ...nodeToolOverrides,
    ...overrideRecord,
  };

  const { kind: executorKind, rawKind: rawExecutorKind, options: executorOptions } = resolveToolExecutorConfig(mergedToolConfig);

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

  const payloadNodeId = options.nodeId ?? runtime.node.node_id;
  const payloadTopK = options.topK ?? runtime.node.top_k;
  const toolPayload = {
    tool: {
      tool_id: toolBinding.tool_id,
      name: toolBinding.name,
      source: toolBinding.source,
    },
    ...(toolContract ? { contract: { name: toolContract.name } } : {}),
    node: {
      node_id: payloadNodeId,
      top_k: payloadTopK,
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

    const contractOutput = toolContract?.definition.buildEmbeddingSuccessOutput
      ? toolContract.definition.buildEmbeddingSuccessOutput({
          input: toolContract.input,
          model: embeddingResult.model,
          embeddings: embeddingResult.embeddings,
        })
      : null;

    return {
      output: {
        kind: 'tool_node',
        executor: 'openrouter-embeddings',
        tool_name: toolBinding.name,
        tool_id: toolBinding.tool_id,
        tool_source: toolBinding.source,
        ...(toolContract ? { contract_name: toolContract.name } : {}),
        ...(contractOutput ? { contract_output_source: 'local-synthetic' } : {}),
        ...(contractOutput ? { contract_output: contractOutput } : {}),
        model: embeddingResult.model,
        input_items: inputTexts.length,
        embeddings: embeddingResult.embeddings,
      },
      costUnits: Math.max(1, Math.ceil(inputTexts.length / 8)),
    };
  }

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

  // Short-circuit: если URL ведёт на наш собственный backend и контракт
  // известен — вызываем buildHttpSuccessOutput напрямую, минуя HTTP-roundtrip.
  // Это в 10× быстрее и устраняет race на single-threaded event loop при
  // параллельных batch-eval прогонах (десятки одновременных VectorUpsert
  // абортили HTTP-self-call ранее как EXECUTOR_TOOLNODE_UNAVAILABLE).
  //
  // Security:
  //  - срабатывает только для точного path '/tool-executor/contracts' на
  //    localhost/127.0.0.1 (наш own backend);
  //  - resolved toolContract.input строится системой по pipeline graph,
  //    user-controlled payload здесь не участвует;
  //  - HTTP /tool-executor/contracts уже монтирован без requireAuth, поэтому
  //    прямой in-process вызов не обходит никакого middleware;
  //  - внешние URL по-прежнему идут через fetch — SSRF-поверхность не меняется.
  if (toolContract?.definition.buildHttpSuccessOutput && isLocalSelfContractsUrl(rawUrl)) {
    try {
      const contractOutput = await toolContract.definition.buildHttpSuccessOutput({
        input: toolContract.input,
        status: 200,
        response: null,
      });
      return {
        output: {
          kind: 'tool_node',
          executor: 'http-json',
          tool_name: toolBinding.name,
          tool_id: toolBinding.tool_id,
          tool_source: toolBinding.source,
          contract_name: toolContract.name,
          ...(contractOutput ? { contract_output_source: 'in-process' } : {}),
          ...(contractOutput ? { contract_output: contractOutput } : {}),
          status: 200,
        },
        costUnits: 1,
      };
    } catch (error) {
      if (isHttpError(error)) throw error;
      throw new HttpError(503, {
        code: 'EXECUTOR_TOOLNODE_INPROC_FAILED',
        error: 'in-process contract resolution failed',
        details: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  // SSRF-защита: deny-list для loopback / private / link-local / metadata-хостов
  // + anti-DNS-rebinding lookup (см. assertSafeExternalUrl). Override через
  // EXECUTOR_HTTP_JSON_ALLOW_PRIVATE=1 для локальной разработки.
  const parsedUrl = await assertSafeExternalUrl(rawUrl);
  const normalizedUrl = parsedUrl.toString();

  const methodRaw =
    typeof executorOptions.method === 'string'
      ? executorOptions.method.toUpperCase()
      : typeof mergedToolConfig.method === 'string'
      ? mergedToolConfig.method.toUpperCase()
      : 'POST';
  const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methodRaw) ? methodRaw : 'POST';
  // Default 60s: при параллельных batch-eval прогонах HTTP к tool-executor
  // получает несколько крупных VectorUpsert payload'ов (десятки тысяч
  // элементов с многомерными векторами) одновременно — single-threaded event
  // loop не успевает за 10s. Можно перекрыть через executor.timeoutMs.
  const timeoutMs = readBoundedInteger(executorOptions.timeoutMs ?? mergedToolConfig.timeoutMs, 60_000, 200, 300_000);

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

  const responseContractOutput = toObjectRecord(toObjectRecord(responseBody)?.contract_output);
  const localContractOutput =
    ENABLE_LOCAL_SYNTHETIC_CONTRACT_OUTPUT && toolContract?.definition.buildHttpSuccessOutput
      ? await toolContract.definition.buildHttpSuccessOutput({
          input: toolContract.input,
          status: response.status,
          response: responseBody,
        })
      : null;
  const contractOutput = responseContractOutput ?? localContractOutput;
  const contractOutputSource = responseContractOutput ? 'executor-response' : localContractOutput ? 'local-synthetic' : null;

  return {
    output: {
      kind: 'tool_node',
      executor: 'http-json',
      tool_name: toolBinding.name,
      tool_id: toolBinding.tool_id,
      tool_source: toolBinding.source,
      ...(toolContract ? { contract_name: toolContract.name } : {}),
      ...(contractOutputSource ? { contract_output_source: contractOutputSource } : {}),
      ...(contractOutput ? { contract_output: contractOutput } : {}),
      status: response.status,
      response: responseBody,
    },
    costUnits: 1,
  };
}
