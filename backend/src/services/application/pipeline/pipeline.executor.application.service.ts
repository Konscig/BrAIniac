import { randomUUID } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import {
  parseGraphValidationPreset,
  validatePipelineGraph,
  type GraphValidationResult,
} from '../../core/graph_validation.service.js';
import { ensurePipelineOwnedByUser } from '../../core/ownership.service.js';
import { getDatasetById, listDatasets } from '../../data/dataset.service.js';
import { listEdgesByPipeline } from '../../data/edge.service.js';
import { listNodesByPipeline } from '../../data/node.service.js';
import { getNodeTypeById } from '../../data/node_type.service.js';
import { getPipelineById, updatePipeline } from '../../data/pipeline.service.js';
import { getToolById } from '../../data/tool.service.js';
import { externalizeNodeStateArtifacts } from './pipeline.executor.artifact-store.js';
import { buildPipelineReport, buildSummary, executeGraph, persistNodeOutputs } from './pipeline.executor.graph.js';
import type {
  DatasetContext,
  ExecutionJob,
  NodeTypeRecord,
  PipelineEdge,
  PipelineExecutionNodeState,
  PipelineExecutionSnapshot,
  PipelineNode,
  PipelineRecord,
  RuntimeNode,
  StartPipelineExecutionInput,
  ToolRecord,
} from './pipeline.executor.types.js';
import { nowIso, normalizeUnknownError, readPositiveInteger } from './pipeline.executor.utils.js';

export type {
  PipelineExecutionNodeState,
  PipelineExecutionSnapshot,
  PipelineExecutionStatus,
  PipelineExecutionSummary,
  StartPipelineExecutionInput,
} from './pipeline.executor.types.js';

const EXECUTION_TTL_MS = readPositiveInteger(process.env.EXECUTOR_JOB_TTL_MS, 15 * 60_000);
const EXECUTION_CACHE_LIMIT = readPositiveInteger(process.env.EXECUTOR_JOB_CACHE_LIMIT, 1_000);

const jobsById = new Map<string, ExecutionJob>();
const inFlightByPipelineId = new Map<number, string>();
const idempotencyIndex = new Map<string, string>();

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

    nodeStates = await Promise.all(
      result.nodeStates.map((nodeState) =>
        externalizeNodeStateArtifacts(nodeState, {
          executionId: job.execution_id,
          nodeId: nodeState.node_id,
          section: 'node-output',
        }),
      ),
    );
    result.nodeStates = nodeStates;
    await persistNodeOutputs(job.execution_id, nodeStates);

    job.warnings.push(...result.warnings);
    if (result.error) {
      job.error = result.error;
    }

    job.summary = buildSummary(result);
    job.status = result.status === 'failed' ? 'failed' : 'succeeded';

    const persistedReport = await externalizeNodeStateArtifacts(buildPipelineReport(job, result, preflight), {
      executionId: job.execution_id,
      section: 'pipeline-report',
    });
    await updatePipeline(job.pipeline_id, {
      report_json: persistedReport,
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
      const failureReport =
        nodeStates.length > 0
          ? await externalizeNodeStateArtifacts(
              {
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
              {
                executionId: job.execution_id,
                section: 'pipeline-report',
              },
            )
          : {
              execution: {
                execution_id: job.execution_id,
                status: 'failed',
                worker_pid: process.pid,
                started_at: job.started_at?.toISOString() ?? null,
                finished_at: nowIso(),
                preset: job.request.preset,
              },
              ...(preflight ? { preflight } : {}),
              error: normalized,
              generated_at: nowIso(),
            };

      await updatePipeline(job.pipeline_id, {
        report_json: failureReport,
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
