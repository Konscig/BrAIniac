import express from 'express';
import { createEdge, listEdgesByVersion, getEdgeById, deleteEdge } from '../services/edge.service.js';
import { getPipelineVersionById } from '../services/pipeline_version.service.js';
import { getPipelineById } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const { versionId, fromNode, toNode, label } = req.body;
    if (!versionId || !fromNode || !toNode) return res.status(400).json({ error: 'versionId, fromNode and toNode required' });
    const version = await getPipelineVersionById(versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const e = await createEdge({ versionId, fromNode, toNode, label });
    res.status(201).json(e);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const versionId = req.query.versionId as string | undefined;
    if (!versionId) return res.status(400).json({ error: 'versionId required' });
    const version = await getPipelineVersionById(versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    const edges = await listEdgesByVersion(versionId);
    res.json(edges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const e = await getEdgeById(req.params.id);
    if (!e) return res.status(404).json({ error: 'not found' });
    const version = await getPipelineVersionById(e.versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    res.json(e);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getEdgeById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const version = await getPipelineVersionById(existing.versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    await deleteEdge(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
