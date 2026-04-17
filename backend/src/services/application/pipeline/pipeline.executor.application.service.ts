import { randomUUID } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import {
  parseGraphValidationPreset,
  validatePipelineGraph,
  type GraphValidationPreset,
  type GraphValidationResult,
} from '../../core/graph_validation.service.js';
import { ensurePipelineOwnedByUser } from '../../core/ownership.service.js';
import { getOpenRouterAdapter } from '../../core/openrouter/openrouter.adapter.js';
import { getDatasetById, listDatasets } from '../../data/dataset.service.js';
import { listEdgesByPipeline } from '../../data/edge.service.js';
import { listNodesByPipeline, updateNode } from '../../data/node.service.js';
import { getNodeTypeById } from '../../data/node_type.service.js';
import { getPipelineById, updatePipeline } from '../../data/pipeline.service.js';
import { getToolById } from '../../data/tool.service.js';

type PipelineRecord = {
  pipeline_id: number;
  max_time: number;
  max_cost: number;
};

type PipelineNode = {
  node_id: number;
  fk_pipeline_id: number;
  fk_type_id: number;
  fk_sub_pipeline: number | null;
  top_k: number;
  ui_json: any;
  output_json: any;
};

type PipelineEdge = {
  fk_from_node: number;
  fk_to_node: number;
};

type NodeTypeRecord = {
  type_id: number;
  fk_tool_id: number;
  name: string;
  config_json: any;
};

type ToolRecord = {
  tool_id: number;
  name: string;
  config_json: any;
};

type DatasetContext = {
  dataset_id: number;
  uri: string;
  desc: string | null;
};

type NodeExecutionStatus = 'completed' | 'failed' | 'skipped';
export type PipelineExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface PipelineExecutionNodeState {
  node_id: number;
  node_type: string;
  runs: number;
  status: NodeExecutionStatus;
  output_json?: any;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export interface PipelineExecutionSummary {
  status: 'succeeded' | 'failed';
  steps_used: number;
  cost_units_used: number;
  duration_ms: number;
  node_total: number;
  node_completed: number;
  node_failed: number;
  node_skipped: number;
}

export interface StartPipelineExecutionInput {
  preset?: GraphValidationPreset;
  dataset_id?: number;
  input_json?: any;
}

export interface PipelineExecutionSnapshot {
  execution_id: string;
  pipeline_id: number;
  status: PipelineExecutionStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  idempotency_key?: string;
  request: StartPipelineExecutionInput;
  preflight?: GraphValidationResult;
  summary?: PipelineExecutionSummary;
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

type ExecutionJob = {
  execution_id: string;
  pipeline_id: number;
  user_id: number;
  status: PipelineExecutionStatus;
  created_at: Date;
  updated_at: Date;
  started_at?: Date;
  finished_at?: Date;
  idempotency_key?: string;
  request: StartPipelineExecutionInput;
  preflight?: GraphValidationResult;
  summary?: PipelineExecutionSummary;
  warnings: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
};

type RuntimeNode = {
  node: PipelineNode;
  nodeType: NodeTypeRecord;
  tool: ToolRecord | null;
  config: any;
};

type NodeHandlerResult = {
  output: any;
  costUnits: number;
};

type ExecuteGraphResult = {
  status: 'succeeded' | 'failed';
  nodeStates: PipelineExecutionNodeState[];
  warnings: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  stepsUsed: number;
  costUnitsUsed: number;
  durationMs: number;
  maxSteps: number;
};

const EXECUTION_TTL_MS = readPositiveInteger(process.env.EXECUTOR_JOB_TTL_MS, 15 * 60_000);
const EXECUTION_CACHE_LIMIT = readPositiveInteger(process.env.EXECUTOR_JOB_CACHE_LIMIT, 1_000);
const STEP_FACTOR = readPositiveInteger(process.env.EXECUTOR_STEP_FACTOR, 4);
const MAX_EMBEDDING_INPUT_ITEMS = readPositiveInteger(process.env.EXECUTOR_EMBEDDING_MAX_INPUTS, 24);
const MAX_EMBEDDING_TEXT_LENGTH = readPositiveInteger(process.env.EXECUTOR_EMBEDDING_MAX_TEXT_LENGTH, 1_800);

const jobsById = new Map<string, ExecutionJob>();
const inFlightByPipelineId = new Map<number, string>();
const idempotencyIndex = new Map<string, string>();

function readPositiveInteger(raw: string | undefined, fallback: number, min = 1): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return parsed;
}

function readBoundedInteger(raw: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function touch(job: ExecutionJob) {
  job.updated_at = new Date();
}

function toSnapshot(job: ExecutionJob): PipelineExecutionSnapshot {
  return {
    execution_id: job.execution_id,
    pipeline_id: job.pipeline_id,
    status: job.status,
    created_at: job.created_at.toISOString(),
    updated_at: job.updated_at.toISOString(),
    ...(job.started_at ? { started_at: job.started_at.toISOString() } : {}),
    ...(job.finished_at ? { finished_at: job.finished_at.toISOString() } : {}),
    ...(job.idempotency_key ? { idempotency_key: job.idempotency_key } : {}),
    request: job.request,
    ...(job.preflight ? { preflight: job.preflight } : {}),
    ...(job.summary ? { summary: job.summary } : {}),
    ...(job.warnings.length > 0 ? { warnings: [...job.warnings] } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

function normalizeIdempotencyKey(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return value.slice(0, 200);
}

function normalizeStartInput(input: StartPipelineExecutionInput): StartPipelineExecutionInput {
  const parsedPreset = input.preset ? parseGraphValidationPreset(input.preset) : 'default';
  if (!parsedPreset) {
    throw new HttpError(400, { error: 'invalid preset' });
  }

  if (input.dataset_id !== undefined) {
    if (!Number.isInteger(input.dataset_id) || input.dataset_id <= 0) {
      throw new HttpError(400, { error: 'invalid dataset_id' });
    }
  }

  return {
    preset: parsedPreset,
    ...(input.dataset_id !== undefined ? { dataset_id: input.dataset_id } : {}),
    ...(input.input_json !== undefined ? { input_json: input.input_json } : {}),
  };
}

function cleanupExecutionStore() {
  const now = Date.now();

  for (const [executionId, job] of jobsById.entries()) {
    if (job.status === 'running' || job.status === 'queued') continue;
    if (now - job.updated_at.getTime() <= EXECUTION_TTL_MS) continue;
    jobsById.delete(executionId);
  }

  if (jobsById.size > EXECUTION_CACHE_LIMIT) {
    const removable = [...jobsById.values()]
      .filter((job) => job.status !== 'running' && job.status !== 'queued')
      .sort((a, b) => a.updated_at.getTime() - b.updated_at.getTime());

    let toRemove = jobsById.size - EXECUTION_CACHE_LIMIT;
    for (const job of removable) {
      if (toRemove <= 0) break;
      jobsById.delete(job.execution_id);
      toRemove -= 1;
    }
  }

  for (const [key, executionId] of idempotencyIndex.entries()) {
    if (!jobsById.has(executionId)) {
      idempotencyIndex.delete(key);
    }
  }

  for (const [pipelineId, executionId] of inFlightByPipelineId.entries()) {
    const job = jobsById.get(executionId);
    if (!job || (job.status !== 'running' && job.status !== 'queued')) {
      inFlightByPipelineId.delete(pipelineId);
    }
  }
}

export async function startPipelineExecutionForUser(
  pipelineId: number,
  userId: number,
  input: StartPipelineExecutionInput,
  idempotencyKeyRaw?: string,
): Promise<PipelineExecutionSnapshot> {
  cleanupExecutionStore();

  await ensurePipelineOwnedByUser(pipelineId, userId, {
    pipelineNotFoundMessage: 'pipeline not found',
    projectNotFoundMessage: 'project not found',
  });

  const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyRaw);
  const idempotencyIndexKey = idempotencyKey ? `${userId}:${pipelineId}:${idempotencyKey}` : undefined;

  if (idempotencyIndexKey) {
    const existingId = idempotencyIndex.get(idempotencyIndexKey);
    if (existingId) {
      const existingJob = jobsById.get(existingId);
      if (existingJob) {
        return toSnapshot(existingJob);
      }
      idempotencyIndex.delete(idempotencyIndexKey);
    }
  }

  const existingInFlight = inFlightByPipelineId.get(pipelineId);
  if (existingInFlight) {
    const runningJob = jobsById.get(existingInFlight);
    if (runningJob && (runningJob.status === 'queued' || runningJob.status === 'running')) {
      throw new HttpError(409, {
        ok: false,
        code: 'PIPELINE_EXECUTION_ALREADY_RUNNING',
        error: 'pipeline execution is already running',
        details: { execution_id: runningJob.execution_id },
      });
    }
  }

  const request = normalizeStartInput(input);
  const now = new Date();
  const executionId = randomUUID();

  const job: ExecutionJob = {
    execution_id: executionId,
    pipeline_id: pipelineId,
    user_id: userId,
    status: 'queued',
    created_at: now,
    updated_at: now,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    request,
    warnings: [],
  };

  jobsById.set(job.execution_id, job);
  inFlightByPipelineId.set(pipelineId, job.execution_id);
  if (idempotencyIndexKey) {
    idempotencyIndex.set(idempotencyIndexKey, job.execution_id);
  }

  void runExecutionJob(job);

  return toSnapshot(job);
}

export async function getPipelineExecutionForUser(
  pipelineId: number,
  executionId: string,
  userId: number,
): Promise<PipelineExecutionSnapshot> {
  cleanupExecutionStore();

  await ensurePipelineOwnedByUser(pipelineId, userId, {
    pipelineNotFoundMessage: 'pipeline not found',
    projectNotFoundMessage: 'project not found',
  });

  const job = jobsById.get(executionId);
  if (!job || job.pipeline_id !== pipelineId) {
    throw new HttpError(404, { error: 'execution not found' });
  }

  return toSnapshot(job);
}

function getRange(configJson: any, key: 'input' | 'output'): { min: number; max: number } {
  if (!configJson || typeof configJson !== 'object') {
    return { min: 0, max: 10 };
  }

  const section = (configJson as any)[key];
  if (!section || typeof section !== 'object') {
    return { min: 0, max: 10 };
  }

  const min = Number((section as any).min);
  const max = Number((section as any).max);

  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
    return { min: 0, max: 10 };
  }

  return { min, max };
}

function getLoopMaxRuns(configJson: any): number {
  if (!configJson || typeof configJson !== 'object') return 1;
  const loop = (configJson as any).loop;
  if (!loop || typeof loop !== 'object') return 1;

  const maxIterations = Number((loop as any).maxIterations);
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) return 1;

  return maxIterations;
}

function toText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (typeof value === 'object') {
    const text = (value as any).text;
    if (typeof text === 'string') return text;
    const prompt = (value as any).prompt;
    if (typeof prompt === 'string') return prompt;
    const content = (value as any).content;
    if (typeof content === 'string') return content;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

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

type ResolvedToolBinding = {
  tool_id: number | null;
  name: string;
  config_json: any;
  source: 'node.tool' | 'node.tool_id' | 'node_type.tool';
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

function tryParseJsonFromText(text: string): any | null {
  if (!text || !text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    // Continue with fenced-json extraction fallback.
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!fencedMatch || typeof fencedMatch[1] !== 'string') return null;

  try {
    return JSON.parse(fencedMatch[1].trim());
  } catch {
    return null;
  }
}

function buildPrompt(inputs: any[], inputJson: any): string {
  const chunks = inputs.map((item) => toText(item)).filter((item) => item.length > 0);
  if (chunks.length === 0 && inputJson !== undefined) {
    const fallback = toText(inputJson);
    if (fallback.length > 0) chunks.push(fallback);
  }
  return chunks.join('\n\n');
}

function normalizeUnknownError(error: unknown): { code: string; message: string; details?: Record<string, any> } {
  if (error instanceof HttpError) {
    return {
      code: typeof error.body.code === 'string' ? error.body.code : `HTTP_${error.status}`,
      message: typeof error.body.error === 'string' ? error.body.error : `HTTP ${error.status}`,
      ...(error.body && typeof error.body === 'object' ? { details: { ...error.body } } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      code: 'EXECUTOR_RUNTIME_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'EXECUTOR_RUNTIME_ERROR',
    message: 'executor failed',
  };
}

async function resolveDatasetContext(pipelineId: number, datasetId?: number): Promise<DatasetContext | null> {
  if (datasetId !== undefined) {
    const dataset = await getDatasetById(datasetId);
    if (!dataset) {
      throw new HttpError(404, { error: 'dataset not found' });
    }

    if (dataset.fk_pipeline_id !== pipelineId) {
      throw new HttpError(400, { error: 'dataset does not belong to pipeline' });
    }

    return {
      dataset_id: dataset.dataset_id,
      uri: dataset.uri,
      desc: dataset.desc ?? null,
    };
  }

  const datasets = await listDatasets(pipelineId);
  if (!datasets || datasets.length === 0) return null;

  const dataset = datasets[0]!;
  return {
    dataset_id: dataset.dataset_id,
    uri: dataset.uri,
    desc: dataset.desc ?? null,
  };
}

async function executeNode(
  runtime: RuntimeNode,
  inputs: any[],
  context: {
    dataset: DatasetContext | null;
    input_json: any;
  },
): Promise<NodeHandlerResult> {
  const typeName = runtime.nodeType.name;

  if (typeName === 'Trigger') {
    return {
      output: {
        kind: 'trigger',
        triggered_at: nowIso(),
        input: context.input_json ?? null,
      },
      costUnits: 0,
    };
  }

  if (typeName === 'ManualInput') {
    return {
      output: {
        kind: 'manual_input',
        value: context.input_json ?? null,
      },
      costUnits: 0,
    };
  }

  if (typeName === 'DatasetInput') {
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
  }

  if (typeName === 'PromptBuilder') {
    const prompt = buildPrompt(inputs, context.input_json);
    return {
      output: {
        kind: 'prompt',
        prompt,
        part_count: inputs.length,
      },
      costUnits: 0,
    };
  }

  if (typeName === 'LLMCall') {
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
  }

  if (typeName === 'AgentCall') {
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
  }

  if (typeName === 'ToolNode') {
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
  }

  if (typeName === 'Parser') {
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
  }

  if (typeName === 'SaveResult') {
    return {
      output: {
        kind: 'save_result',
        saved_at: nowIso(),
        received_inputs: inputs.length,
        preview: inputs.length > 0 ? inputs[0] : null,
      },
      costUnits: 0,
    };
  }

  return {
    output: {
      kind: 'not_implemented',
      node_type: typeName,
      message: 'handler is not implemented in current executor mvp',
      received_inputs: inputs.length,
    },
    costUnits: 0,
  };
}

async function executeGraph(
  pipeline: PipelineRecord,
  runtimeByNodeId: Map<number, RuntimeNode>,
  edges: PipelineEdge[],
  context: {
    dataset: DatasetContext | null;
    input_json: any;
  },
  maxStepsHint: number,
): Promise<ExecuteGraphResult> {
  const startedAt = Date.now();
  const nodeIds = [...runtimeByNodeId.keys()].sort((a, b) => a - b);

  const predecessors = new Map<number, number[]>();
  const successors = new Map<number, number[]>();

  for (const nodeId of nodeIds) {
    predecessors.set(nodeId, []);
    successors.set(nodeId, []);
  }

  for (const edge of edges) {
    if (!runtimeByNodeId.has(edge.fk_from_node) || !runtimeByNodeId.has(edge.fk_to_node)) continue;
    predecessors.get(edge.fk_to_node)!.push(edge.fk_from_node);
    successors.get(edge.fk_from_node)!.push(edge.fk_to_node);
  }

  const queue: number[] = [];
  const queued = new Set<number>();
  const producedOutputs = new Map<number, any>();
  const runCounts = new Map<number, number>();
  const nodeStates = new Map<number, PipelineExecutionNodeState>();
  const warnings: string[] = [];

  const enqueue = (nodeId: number) => {
    if (!queued.has(nodeId)) {
      queue.push(nodeId);
      queued.add(nodeId);
    }
  };

  for (const nodeId of nodeIds) {
    const runtime = runtimeByNodeId.get(nodeId)!;
    const inputMin = getRange(runtime.config, 'input').min;
    if (inputMin === 0) {
      enqueue(nodeId);
    }
  }

  if (queue.length === 0 && nodeIds.length > 0) {
    enqueue(nodeIds[0]!);
    warnings.push('executor bootstrapped first node because no zero-input nodes were found');
  }

  const maxSteps = Math.max(nodeIds.length * STEP_FACTOR, maxStepsHint, 1);
  const maxTimeMs = Math.max(1, Number(pipeline.max_time) * 1000);
  const maxCostUnits = Math.max(0, Number(pipeline.max_cost));

  let stepsUsed = 0;
  let costUnitsUsed = 0;
  let failure: ExecuteGraphResult['error'];

  while (queue.length > 0) {
    if (Date.now() - startedAt > maxTimeMs) {
      failure = {
        code: 'EXECUTOR_TIME_BUDGET_EXCEEDED',
        message: 'execution exceeded max_time budget',
        details: { maxTimeMs },
      };
      break;
    }

    if (stepsUsed >= maxSteps) {
      failure = {
        code: 'EXECUTOR_STEP_BUDGET_EXCEEDED',
        message: 'execution exceeded estimated step budget',
        details: { maxSteps },
      };
      break;
    }

    const nodeId = queue.shift()!;
    queued.delete(nodeId);

    const runtime = runtimeByNodeId.get(nodeId);
    if (!runtime) continue;

    const maxRuns = getLoopMaxRuns(runtime.config);
    const nextRun = (runCounts.get(nodeId) ?? 0) + 1;
    if (nextRun > maxRuns) {
      continue;
    }

    const predecessorIds = predecessors.get(nodeId) ?? [];
    const availableInputs = predecessorIds
      .filter((predId) => producedOutputs.has(predId))
      .map((predId) => producedOutputs.get(predId));

    const inputRange = getRange(runtime.config, 'input');
    if (availableInputs.length < inputRange.min) {
      const canStillBeUnblocked = predecessorIds.some((predId) => {
        const predRuntime = runtimeByNodeId.get(predId);
        if (!predRuntime) return false;
        const predRuns = runCounts.get(predId) ?? 0;
        return predRuns < getLoopMaxRuns(predRuntime.config);
      });

      if (canStillBeUnblocked) {
        enqueue(nodeId);
      }
      continue;
    }

    runCounts.set(nodeId, nextRun);

    try {
      const result = await executeNode(runtime, availableInputs, context);
      stepsUsed += 1;
      costUnitsUsed += result.costUnits;

      producedOutputs.set(nodeId, result.output);
      nodeStates.set(nodeId, {
        node_id: nodeId,
        node_type: runtime.nodeType.name,
        runs: nextRun,
        status: 'completed',
        output_json: result.output,
      });

      if (maxCostUnits > 0 && costUnitsUsed > maxCostUnits) {
        failure = {
          code: 'EXECUTOR_COST_BUDGET_EXCEEDED',
          message: 'execution exceeded max_cost budget',
          details: { maxCostUnits },
        };
        break;
      }

      const nextNodes = successors.get(nodeId) ?? [];
      for (const nextNodeId of nextNodes) {
        enqueue(nextNodeId);
      }
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      stepsUsed += 1;

      nodeStates.set(nodeId, {
        node_id: nodeId,
        node_type: runtime.nodeType.name,
        runs: nextRun,
        status: 'failed',
        error: normalized,
      });

      failure = {
        code: 'EXECUTOR_NODE_FAILED',
        message: 'node execution failed',
        details: {
          node_id: nodeId,
          node_type: runtime.nodeType.name,
          node_error: normalized,
        },
      };
      break;
    }
  }

  for (const nodeId of nodeIds) {
    if (nodeStates.has(nodeId)) continue;

    const runtime = runtimeByNodeId.get(nodeId)!;
    const runs = runCounts.get(nodeId) ?? 0;
    const reason = runs > 0 ? 'node reached runtime limits' : 'node was not triggered';

    nodeStates.set(nodeId, {
      node_id: nodeId,
      node_type: runtime.nodeType.name,
      runs,
      status: 'skipped',
      output_json: {
        kind: 'skipped',
        reason,
      },
    });
  }

  const orderedNodeStates = [...nodeStates.values()].sort((a, b) => a.node_id - b.node_id);

  if (!failure) {
    const hasCompletedNodes = orderedNodeStates.some((item) => item.status === 'completed');
    if (!hasCompletedNodes) {
      failure = {
        code: 'EXECUTOR_NO_PROGRESS',
        message: 'executor finished without running any node',
      };
    }
  }

  return {
    status: failure ? 'failed' : 'succeeded',
    nodeStates: orderedNodeStates,
    warnings,
    ...(failure ? { error: failure } : {}),
    stepsUsed,
    costUnitsUsed,
    durationMs: Date.now() - startedAt,
    maxSteps,
  };
}

async function persistNodeOutputs(executionId: string, nodeStates: PipelineExecutionNodeState[]) {
  await Promise.all(
    nodeStates.map((nodeState) =>
      updateNode(nodeState.node_id, {
        output_json: {
          execution_id: executionId,
          status: nodeState.status,
          runs: nodeState.runs,
          ...(nodeState.output_json !== undefined ? { data: nodeState.output_json } : {}),
          ...(nodeState.error ? { error: nodeState.error } : {}),
          updated_at: nowIso(),
        },
      }),
    ),
  );
}

function buildSummary(result: ExecuteGraphResult): PipelineExecutionSummary {
  return {
    status: result.status,
    steps_used: result.stepsUsed,
    cost_units_used: result.costUnitsUsed,
    duration_ms: result.durationMs,
    node_total: result.nodeStates.length,
    node_completed: result.nodeStates.filter((item) => item.status === 'completed').length,
    node_failed: result.nodeStates.filter((item) => item.status === 'failed').length,
    node_skipped: result.nodeStates.filter((item) => item.status === 'skipped').length,
  };
}

function buildPipelineReport(
  job: ExecutionJob,
  result: ExecuteGraphResult,
  preflight: GraphValidationResult,
): Record<string, any> {
  return {
    execution: {
      execution_id: job.execution_id,
      status: result.status,
      worker_pid: process.pid,
      started_at: job.started_at?.toISOString() ?? null,
      finished_at: job.finished_at?.toISOString() ?? null,
      duration_ms: result.durationMs,
      steps_used: result.stepsUsed,
      max_steps: result.maxSteps,
      cost_units_used: result.costUnitsUsed,
      preset: job.request.preset,
    },
    preflight: {
      valid: preflight.valid,
      errors: preflight.errors,
      warnings: preflight.warnings,
      metrics: preflight.metrics,
    },
    warnings: [...job.warnings, ...result.warnings],
    ...(result.error ? { error: result.error } : {}),
    nodes: result.nodeStates,
    generated_at: nowIso(),
  };
}

async function runExecutionJob(job: ExecutionJob) {
  job.status = 'running';
  job.started_at = new Date();
  touch(job);

  let nodeStates: PipelineExecutionNodeState[] = [];
  let preflight: GraphValidationResult | undefined;

  try {
    const pipeline = (await getPipelineById(job.pipeline_id)) as PipelineRecord | null;
    if (!pipeline) {
      throw new HttpError(404, { error: 'pipeline not found' });
    }

    preflight = await validatePipelineGraph(job.pipeline_id, job.request.preset ?? 'default');
    job.preflight = preflight;

    if (!preflight.valid) {
      job.error = {
        code: 'PIPELINE_GRAPH_INVALID',
        message: 'pipeline graph validation failed',
        details: {
          errors: preflight.errors,
        },
      };
      job.status = 'failed';
      job.summary = {
        status: 'failed',
        steps_used: 0,
        cost_units_used: 0,
        duration_ms: 0,
        node_total: 0,
        node_completed: 0,
        node_failed: 0,
        node_skipped: 0,
      };

      await updatePipeline(job.pipeline_id, {
        report_json: {
          execution: {
            execution_id: job.execution_id,
            status: 'failed',
            worker_pid: process.pid,
            started_at: job.started_at?.toISOString() ?? null,
            finished_at: nowIso(),
            preset: job.request.preset,
          },
          preflight,
          error: job.error,
          generated_at: nowIso(),
        },
      });

      return;
    }

    const [rawNodes, rawEdges, datasetContext] = await Promise.all([
      listNodesByPipeline(job.pipeline_id),
      listEdgesByPipeline(job.pipeline_id),
      resolveDatasetContext(job.pipeline_id, job.request.dataset_id),
    ]);

    const nodes = (rawNodes as PipelineNode[]).sort((a, b) => a.node_id - b.node_id);
    const edges = rawEdges as PipelineEdge[];

    const nodeTypeIds = [...new Set(nodes.map((node) => node.fk_type_id))];
    const nodeTypeMap = new Map<number, NodeTypeRecord>();

    for (const nodeTypeId of nodeTypeIds) {
      const nodeType = (await getNodeTypeById(nodeTypeId)) as NodeTypeRecord | null;
      if (!nodeType) {
        throw new HttpError(400, {
          code: 'EXECUTOR_NODETYPE_NOT_FOUND',
          error: `node type ${nodeTypeId} not found`,
        });
      }
      nodeTypeMap.set(nodeTypeId, nodeType);
    }

    const toolIds = [...new Set([...nodeTypeMap.values()].map((item) => item.fk_tool_id))];
    const toolMap = new Map<number, ToolRecord>();

    for (const toolId of toolIds) {
      const tool = (await getToolById(toolId)) as ToolRecord | null;
      if (tool) {
        toolMap.set(toolId, tool);
      }
    }

    const runtimeByNodeId = new Map<number, RuntimeNode>();
    for (const node of nodes) {
      const nodeType = nodeTypeMap.get(node.fk_type_id)!;
      runtimeByNodeId.set(node.node_id, {
        node,
        nodeType,
        tool: toolMap.get(nodeType.fk_tool_id) ?? null,
        config: nodeType.config_json ?? {},
      });
    }

    const result = await executeGraph(
      pipeline,
      runtimeByNodeId,
      edges,
      {
        dataset: datasetContext,
        input_json: job.request.input_json,
      },
      preflight.metrics.estimatedMaxSteps,
    );

    nodeStates = result.nodeStates;
    await persistNodeOutputs(job.execution_id, nodeStates);

    job.warnings.push(...result.warnings);
    if (result.error) {
      job.error = result.error;
    }

    job.summary = buildSummary(result);
    job.status = result.status === 'failed' ? 'failed' : 'succeeded';

    await updatePipeline(job.pipeline_id, {
      report_json: buildPipelineReport(job, result, preflight),
    });
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    job.status = 'failed';
    job.error = normalized;

    try {
      await persistNodeOutputs(job.execution_id, nodeStates);
    } catch (persistError) {
      console.error('[executor] failed to persist partial node outputs', persistError);
    }

    try {
      await updatePipeline(job.pipeline_id, {
        report_json: {
          execution: {
            execution_id: job.execution_id,
            status: 'failed',
            worker_pid: process.pid,
            started_at: job.started_at?.toISOString() ?? null,
            finished_at: nowIso(),
            preset: job.request.preset,
          },
          ...(preflight ? { preflight } : {}),
          ...(nodeStates.length > 0 ? { nodes: nodeStates } : {}),
          error: normalized,
          generated_at: nowIso(),
        },
      });
    } catch (persistError) {
      console.error('[executor] failed to persist pipeline report', persistError);
    }
  } finally {
    job.finished_at = new Date();
    touch(job);

    if (inFlightByPipelineId.get(job.pipeline_id) === job.execution_id) {
      inFlightByPipelineId.delete(job.pipeline_id);
    }

    cleanupExecutionStore();
  }
}
