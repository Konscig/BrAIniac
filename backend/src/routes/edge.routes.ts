import express from 'express';
import { createEdge, listEdgesByPipeline, getEdgeById, deleteEdge } from '../services/edge.service.js';
import { getNodeById } from '../services/node.service.js';
import { getPipelineById } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_from_node = parseId(req.body.fk_from_node);
    const fk_to_node = parseId(req.body.fk_to_node);
    if (!fk_from_node || !fk_to_node) {
      return res.status(400).json({ error: 'fk_from_node and fk_to_node required' });
    }
    if (fk_from_node === fk_to_node) {
      return res.status(400).json({ error: 'self-loop is not allowed' });
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
