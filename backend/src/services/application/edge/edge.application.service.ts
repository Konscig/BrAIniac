import { HttpError } from '../../../common/http-error.js';
import { createEdge, deleteEdge, getEdgeById, listEdgesByPipeline } from '../../data/edge.service.js';
import { getNodeById, listNodesByPipeline } from '../../data/node.service.js';
import { getNodeTypeById } from '../../data/node_type.service.js';
import { ensurePipelineOwnedByUser } from '../../core/ownership.service.js';

type PipelineEdge = { fk_from_node: number; fk_to_node: number };

function buildAdjacency(edges: PipelineEdge[]) {
  const adjacency = new Map<number, number[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fk_from_node) ?? [];
    list.push(edge.fk_to_node);
    adjacency.set(edge.fk_from_node, list);
  }
  return adjacency;
}

function findPath(start: number, target: number, adjacency: Map<number, number[]>) {
  const queue: number[] = [start];
  const visited = new Set<number>([start]);
  const parent = new Map<number, number | null>([[start, null]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) {
      const path: number[] = [];
      let cursor: number | null = current;
      while (cursor !== null) {
        path.push(cursor);
        cursor = parent.get(cursor) ?? null;
      }
      path.reverse();
      return path;
    }

    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      queue.push(next);
    }
  }

  return null;
}

function getLoopLimitStatus(configJson: any): 'missing' | 'invalid' | 'valid' {
  if (!configJson || typeof configJson !== 'object') return 'missing';

  const loop = (configJson as any).loop;
  if (loop === undefined || loop === null) return 'missing';
  if (typeof loop !== 'object') return 'invalid';

  const maxIterationsRaw = (loop as any).maxIterations;
  const maxIterations = Number(maxIterationsRaw);
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) return 'invalid';

  return 'valid';
}

async function validateCyclePolicy(pipelineId: number, fromNodeId: number, toNodeId: number) {
  let cycleNodeIds: number[];

  if (fromNodeId === toNodeId) {
    cycleNodeIds = [fromNodeId];
  } else {
    const edges = (await listEdgesByPipeline(pipelineId)) as PipelineEdge[];
    const adjacency = buildAdjacency(edges);
    const pathFromToToFrom = findPath(toNodeId, fromNodeId, adjacency);

    if (!pathFromToToFrom) {
      return;
    }

    cycleNodeIds = pathFromToToFrom;
  }

  const nodes = await listNodesByPipeline(pipelineId);
  const nodeMap = new Map<number, any>(nodes.map((node: any) => [node.node_id, node]));
  const nodeTypeCache = new Map<number, any>();

  let hasValid = false;
  let hasInvalid = false;

  for (const nodeId of cycleNodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    let nodeType = nodeTypeCache.get(node.fk_type_id);
    if (!nodeType) {
      nodeType = await getNodeTypeById(node.fk_type_id);
      nodeTypeCache.set(node.fk_type_id, nodeType);
    }

    const status = getLoopLimitStatus((nodeType as any)?.config_json);
    if (status === 'valid') hasValid = true;
    if (status === 'invalid') hasInvalid = true;
  }

  if (hasValid) {
    return;
  }

  if (hasInvalid) {
    throw new HttpError(400, {
      ok: false,
      code: 'GRAPH_LOOP_MAX_ITER_INVALID',
      error: 'cycle requires loop.maxIterations >= 1 in NodeType config_json',
      details: { cycleNodeIds },
    });
  }

  throw new HttpError(400, {
    ok: false,
    code: 'GRAPH_LOOP_POLICY_REQUIRED',
    error: 'cycle requires loop policy in NodeType config_json',
    details: { cycleNodeIds },
  });
}

export async function createEdgeForUser(fromNodeId: number, toNodeId: number, userId: number) {
  const fromNode = await getNodeById(fromNodeId);
  if (!fromNode) throw new HttpError(404, { error: 'from node not found' });

  const toNode = await getNodeById(toNodeId);
  if (!toNode) throw new HttpError(404, { error: 'to node not found' });

  if (fromNode.fk_pipeline_id !== toNode.fk_pipeline_id) {
    throw new HttpError(400, { error: 'cross-pipeline edge is not allowed' });
  }

  const pipeline = await ensurePipelineOwnedByUser(fromNode.fk_pipeline_id, userId, {
    pipelineNotFoundMessage: 'pipeline not found',
    projectNotFoundMessage: 'project not found',
  });
  await validateCyclePolicy(pipeline.pipeline_id, fromNodeId, toNodeId);

  return createEdge({ fk_from_node: fromNodeId, fk_to_node: toNodeId });
}

export async function listEdgesForPipelineForUser(pipelineId: number, userId: number) {
  await ensurePipelineOwnedByUser(pipelineId, userId, {
    pipelineNotFoundMessage: 'pipeline not found',
    projectNotFoundMessage: 'project not found',
  });
  return listEdgesByPipeline(pipelineId);
}

export async function getEdgeByIdForUser(edgeId: number, userId: number) {
  const edge = await getEdgeById(edgeId);
  if (!edge) throw new HttpError(404, { error: 'not found' });

  await ensurePipelineOwnedByUser(edge.from_node.fk_pipeline_id, userId, {
    pipelineNotFoundMessage: 'pipeline not found',
    projectNotFoundMessage: 'project not found',
  });
  return edge;
}

export async function deleteEdgeByIdForUser(edgeId: number, userId: number) {
  const edge = await getEdgeById(edgeId);
  if (!edge) throw new HttpError(404, { error: 'not found' });

  await ensurePipelineOwnedByUser(edge.from_node.fk_pipeline_id, userId, {
    pipelineNotFoundMessage: 'pipeline not found',
    projectNotFoundMessage: 'project not found',
  });
  await deleteEdge(edgeId);
}
