import express from 'express';
import { createEdge, listEdgesByPipeline, getEdgeById, deleteEdge } from '../services/edge.service.js';
import { getNodeById, listNodesByPipeline } from '../services/node.service.js';
import { getPipelineById } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { getNodeTypeById } from '../services/node_type.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

function buildAdjacency(edges: Array<{ fk_from_node: number; fk_to_node: number }>) {
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
  let cycleNodeIds: number[] | null = null;

  if (fromNodeId === toNodeId) {
    cycleNodeIds = [fromNodeId];
  } else {
    const edges = (await listEdgesByPipeline(pipelineId)) as Array<{ fk_from_node: number; fk_to_node: number }>;
    const adjacency = buildAdjacency(edges);
    const pathFromToToFrom = findPath(toNodeId, fromNodeId, adjacency);

    if (!pathFromToToFrom) {
      return { ok: true as const };
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
    return { ok: true as const };
  }

  if (hasInvalid) {
    return {
      ok: false as const,
      code: 'GRAPH_LOOP_MAX_ITER_INVALID',
      error: 'cycle requires loop.maxIterations >= 1 in NodeType config_json',
      details: { cycleNodeIds },
    };
  }

  return {
    ok: false as const,
    code: 'GRAPH_LOOP_POLICY_REQUIRED',
    error: 'cycle requires loop policy in NodeType config_json',
    details: { cycleNodeIds },
  };
}

router.post('/', async (req: any, res: any) => {
  try {
    const fk_from_node = parseId(req.body.fk_from_node);
    const fk_to_node = parseId(req.body.fk_to_node);
    if (!fk_from_node || !fk_to_node) {
      return res.status(400).json({ error: 'fk_from_node and fk_to_node required' });
    }

    const fromNode = await getNodeById(fk_from_node);
    if (!fromNode) return res.status(404).json({ error: 'from node not found' });
    const toNode = await getNodeById(fk_to_node);
    if (!toNode) return res.status(404).json({ error: 'to node not found' });
    if (fromNode.fk_pipeline_id !== toNode.fk_pipeline_id) {
      return res.status(400).json({ error: 'cross-pipeline edge is not allowed' });
    }

    const pipeline = await getPipelineById(fromNode.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    const cycleValidation = await validateCyclePolicy(pipeline.pipeline_id, fk_from_node, fk_to_node);
    if (!cycleValidation.ok) {
      return res.status(400).json(cycleValidation);
    }

    const e = await createEdge({ fk_from_node, fk_to_node });
    res.status(201).json(e);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const pipelineId = parseId(req.query.fk_pipeline_id);
    if (!pipelineId) return res.status(400).json({ error: 'fk_pipeline_id required' });

    const pipeline = await getPipelineById(pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    const edges = await listEdgesByPipeline(pipelineId);
    res.json(edges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const edgeId = parseId(req.params.id);
    if (!edgeId) return res.status(400).json({ error: 'invalid id' });

    const e = await getEdgeById(edgeId);
    if (!e) return res.status(404).json({ error: 'not found' });

    const pipeline = await getPipelineById(e.from_node.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    res.json(e);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const edgeId = parseId(req.params.id);
    if (!edgeId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getEdgeById(edgeId);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const pipeline = await getPipelineById(existing.from_node.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    await deleteEdge(edgeId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
