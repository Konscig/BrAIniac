import { randomUUID } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import {
  getGraphValidationPresetOptions,
  parseGraphValidationPreset,
  validatePipelineGraph,
  type GraphValidationOptions,
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
  validation?: Partial<GraphValidationOptions>;
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

const jobsById = new Map<string, ExecutionJob>();
const inFlightByPipelineId = new Map<number, string>();
const idempotencyIndex = new Map<string, string>();

function readPositiveInteger(raw: string | undefined, fallback: number, min = 1): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
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

function sanitizeValidationOverrides(value: unknown): Partial<GraphValidationOptions> {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Partial<GraphValidationOptions>;
  const out: Partial<GraphValidationOptions> = {};

  if (raw.mode === 'strict' || raw.mode === 'relaxed') out.mode = raw.mode;
  if (typeof raw.includeWarnings === 'boolean') out.includeWarnings = raw.includeWarnings;
  if (raw.profileFallback === 'warn' || raw.profileFallback === 'strict' || raw.profileFallback === 'off') {
    out.profileFallback = raw.profileFallback;
  }
  if (typeof raw.enforceLoopPolicies === 'boolean') out.enforceLoopPolicies = raw.enforceLoopPolicies;
  if (typeof raw.requireExecutionBudgets === 'boolean') out.requireExecutionBudgets = raw.requireExecutionBudgets;
  if (raw.roleValidationMode === 'off' || raw.roleValidationMode === 'warn' || raw.roleValidationMode === 'strict') {
    out.roleValidationMode = raw.roleValidationMode;
  }

  return out;
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
    validation: sanitizeValidationOverrides(input.validation),
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

    const validationOptions: Partial<GraphValidationOptions> = {
      ...getGraphValidationPresetOptions(job.request.preset ?? 'default'),
      ...sanitizeValidationOverrides(job.request.validation),
    };

    preflight = await validatePipelineGraph(job.pipeline_id, validationOptions);
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
