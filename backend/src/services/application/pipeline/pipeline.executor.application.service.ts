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
import { buildFinalResult, buildPipelineReport, buildSummary, executeGraph, persistNodeOutputs } from './pipeline.executor.graph.js';
import {
  claimIdempotencyExecutionRecord,
  claimInFlightExecutionRecord,
  deleteInFlightExecutionRecord,
  deleteIdempotencyExecutionRecord,
  readExecutionSnapshot,
  readIdempotencyExecutionRecord,
  isCoordinationRecordStale,
  writeExecutionSnapshot,
  writeIdempotencyExecutionRecord,
  writeInFlightExecutionRecord,
} from './pipeline.executor.snapshot-store.js';
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
const EXECUTION_SNAPSHOT_WAIT_MS = readPositiveInteger(process.env.EXECUTOR_SNAPSHOT_WAIT_MS, 1200);
const EXECUTION_SNAPSHOT_WAIT_INTERVAL_MS = readPositiveInteger(process.env.EXECUTOR_SNAPSHOT_WAIT_INTERVAL_MS, 100);

const jobsById = new Map<string, ExecutionJob>();
const inFlightByPipelineId = new Map<number, string>();
const idempotencyIndex = new Map<string, string>();

async function persistExecutionSnapshotBestEffort(job: ExecutionJob) {
  try {
    await writeExecutionSnapshot(toSnapshot(job));
    if (job.status === 'queued' || job.status === 'running') {
      await writeInFlightExecutionRecord(job.pipeline_id, job.execution_id);
    }
  } catch (error) {
    console.error('[executor] failed to persist execution snapshot', error);
  }
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
    ...(job.final_result ? { final_result: job.final_result } : {}),
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

async function waitForPersistedSnapshot(executionId: string, pipelineId: number): Promise<PipelineExecutionSnapshot | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= EXECUTION_SNAPSHOT_WAIT_MS) {
    const snapshot = await readExecutionSnapshot(executionId);
    if (snapshot && snapshot.pipeline_id === pipelineId) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, EXECUTION_SNAPSHOT_WAIT_INTERVAL_MS));
  }

  return null;
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
  const request = normalizeStartInput(input);
  const now = new Date();
  const executionId = randomUUID();

  if (idempotencyIndexKey) {
    const resolvedIdempotencyKey = idempotencyKey;
    if (!resolvedIdempotencyKey) {
      throw new HttpError(500, { error: 'executor idempotency key state is inconsistent' });
    }

    const existingId = idempotencyIndex.get(idempotencyIndexKey);
    if (existingId) {
      const existingJob = jobsById.get(existingId);
      if (existingJob) {
        return toSnapshot(existingJob);
      }
      idempotencyIndex.delete(idempotencyIndexKey);
    }

    const persistedIdempotency = await readIdempotencyExecutionRecord(userId, pipelineId, resolvedIdempotencyKey);
    if (persistedIdempotency) {
      const existingJob = jobsById.get(persistedIdempotency.execution_id);
      if (existingJob) {
        return toSnapshot(existingJob);
      }

      const persistedSnapshot = await readExecutionSnapshot(persistedIdempotency.execution_id);
      if (persistedSnapshot && persistedSnapshot.pipeline_id === pipelineId) {
        return persistedSnapshot;
      }

      const waitedSnapshot = await waitForPersistedSnapshot(persistedIdempotency.execution_id, pipelineId);
      if (waitedSnapshot) {
        return waitedSnapshot;
      }

      if (isCoordinationRecordStale(persistedIdempotency.updated_at)) {
        await deleteIdempotencyExecutionRecord(userId, pipelineId, resolvedIdempotencyKey);
      } else {
        return {
          execution_id: persistedIdempotency.execution_id,
          pipeline_id: pipelineId,
          status: 'queued',
          created_at: persistedIdempotency.updated_at,
          updated_at: persistedIdempotency.updated_at,
          ...(resolvedIdempotencyKey ? { idempotency_key: resolvedIdempotencyKey } : {}),
          request,
        };
      }
    }

    const idempotencyClaim = await claimIdempotencyExecutionRecord(userId, pipelineId, resolvedIdempotencyKey, executionId);
    if (!idempotencyClaim.claimed) {
      const existingJob = jobsById.get(idempotencyClaim.record.execution_id);
      if (existingJob) {
        return toSnapshot(existingJob);
      }

      const claimedSnapshot = await waitForPersistedSnapshot(idempotencyClaim.record.execution_id, pipelineId);
      if (claimedSnapshot) {
        return claimedSnapshot;
      }

      if (!isCoordinationRecordStale(idempotencyClaim.record.updated_at)) {
        return {
          execution_id: idempotencyClaim.record.execution_id,
          pipeline_id: pipelineId,
          status: 'queued',
          created_at: idempotencyClaim.record.updated_at,
          updated_at: idempotencyClaim.record.updated_at,
          ...(resolvedIdempotencyKey ? { idempotency_key: resolvedIdempotencyKey } : {}),
          request,
        };
      }

      await deleteIdempotencyExecutionRecord(userId, pipelineId, resolvedIdempotencyKey);
      const retryClaim = await claimIdempotencyExecutionRecord(userId, pipelineId, resolvedIdempotencyKey, executionId);
      if (!retryClaim.claimed) {
        throw new HttpError(409, {
          ok: false,
          code: 'PIPELINE_EXECUTION_IDEMPOTENCY_RACE',
          error: 'idempotent pipeline execution is already being initialized',
          details: { execution_id: retryClaim.record.execution_id },
        });
      }
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

  const inFlightClaim = await claimInFlightExecutionRecord(pipelineId, executionId);
  if (!inFlightClaim.claimed) {
    const runningJob = jobsById.get(inFlightClaim.record.execution_id);
    if (runningJob && (runningJob.status === 'queued' || runningJob.status === 'running')) {
      throw new HttpError(409, {
        ok: false,
        code: 'PIPELINE_EXECUTION_ALREADY_RUNNING',
        error: 'pipeline execution is already running',
        details: { execution_id: runningJob.execution_id },
      });
    }

    const persistedSnapshot = await readExecutionSnapshot(inFlightClaim.record.execution_id);
    if (persistedSnapshot && (persistedSnapshot.status === 'queued' || persistedSnapshot.status === 'running')) {
      throw new HttpError(409, {
        ok: false,
        code: 'PIPELINE_EXECUTION_ALREADY_RUNNING',
        error: 'pipeline execution is already running',
        details: { execution_id: persistedSnapshot.execution_id },
      });
    }

    await deleteInFlightExecutionRecord(pipelineId, inFlightClaim.record.execution_id);
    const retryClaim = await claimInFlightExecutionRecord(pipelineId, executionId);
    if (!retryClaim.claimed) {
      if (idempotencyKey) {
        await deleteIdempotencyExecutionRecord(userId, pipelineId, idempotencyKey);
      }
      throw new HttpError(409, {
        ok: false,
        code: 'PIPELINE_EXECUTION_ALREADY_RUNNING',
        error: 'pipeline execution is already running',
        details: { execution_id: retryClaim.record.execution_id },
      });
    }
  }

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

  if (idempotencyKey) {
    await writeIdempotencyExecutionRecord(userId, pipelineId, idempotencyKey, job.execution_id);
  }
  await persistExecutionSnapshotBestEffort(job);

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
  if (job && job.pipeline_id === pipelineId) {
    return toSnapshot(job);
  }

  const persistedSnapshot = await readExecutionSnapshot(executionId);
  if (!persistedSnapshot || persistedSnapshot.pipeline_id !== pipelineId) {
    throw new HttpError(404, { error: 'execution not found' });
  }

  return persistedSnapshot;
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
  await persistExecutionSnapshotBestEffort(job);

  let nodeStates: PipelineExecutionNodeState[] = [];
  let preflight: GraphValidationResult | undefined;

  try {
    const pipeline = (await getPipelineById(job.pipeline_id)) as PipelineRecord | null;
    if (!pipeline) {
      throw new HttpError(404, { error: 'pipeline not found' });
    }

    preflight = await validatePipelineGraph(job.pipeline_id, job.request.preset ?? 'default');
    job.preflight = preflight;
    await persistExecutionSnapshotBestEffort(job);

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

      await persistExecutionSnapshotBestEffort(job);

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
    const finalResult = buildFinalResult(result);
    if (finalResult) {
      job.final_result = finalResult;
    } else if ('final_result' in job) {
      delete job.final_result;
    }
    job.status = result.status === 'failed' ? 'failed' : 'succeeded';
    touch(job);

    const persistedReport = await externalizeNodeStateArtifacts(buildPipelineReport(job, result, preflight), {
      executionId: job.execution_id,
      section: 'pipeline-report',
    });
    await updatePipeline(job.pipeline_id, {
      report_json: persistedReport,
    });
    await persistExecutionSnapshotBestEffort(job);
  } catch (error) {
    const normalized = normalizeUnknownError(error);
    job.status = 'failed';
    job.error = normalized;
    touch(job);

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

    await persistExecutionSnapshotBestEffort(job);
  } finally {
    job.finished_at = new Date();
    touch(job);
    await persistExecutionSnapshotBestEffort(job);

    if (inFlightByPipelineId.get(job.pipeline_id) === job.execution_id) {
      inFlightByPipelineId.delete(job.pipeline_id);
    }
    await deleteInFlightExecutionRecord(job.pipeline_id, job.execution_id);

    cleanupExecutionStore();
  }
}
