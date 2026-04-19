import type { GraphValidationResult } from '../../core/graph_validation.service.js';
import { updateNode } from '../../data/node.service.js';
import { executeNode } from './pipeline.executor.node-handlers.js';
import type {
  ExecuteGraphResult,
  ExecutionJob,
  NodeExecutionContext,
  PipelineEdge,
  PipelineExecutionNodeState,
  PipelineExecutionSummary,
  PipelineRecord,
  RuntimeNode,
} from './pipeline.executor.types.js';
import { getLoopMaxRuns, getRange, normalizeUnknownError, nowIso, readPositiveInteger } from './pipeline.executor.utils.js';

const STEP_FACTOR = readPositiveInteger(process.env.EXECUTOR_STEP_FACTOR, 4);

export async function executeGraph(
  pipeline: PipelineRecord,
  runtimeByNodeId: Map<number, RuntimeNode>,
  edges: PipelineEdge[],
  context: NodeExecutionContext,
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
    const predecessorIds = predecessors.get(nodeId) ?? [];
    if (inputMin === 0 && predecessorIds.length === 0) {
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
    const availableInputs = predecessorIds.filter((predId) => producedOutputs.has(predId)).map((predId) => producedOutputs.get(predId));

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

export async function persistNodeOutputs(executionId: string, nodeStates: PipelineExecutionNodeState[]) {
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

export function buildSummary(result: ExecuteGraphResult): PipelineExecutionSummary {
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

export function buildPipelineReport(job: ExecutionJob, result: ExecuteGraphResult, preflight: GraphValidationResult): Record<string, any> {
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
