import express from 'express';
import { createNode, updateNode, getNodeById, listNodesByVersion, updateNodeFields } from '../services/node.service.js';
import { getPipelineVersionById } from '../services/pipeline_version.service.js';
import { getPipelineById } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const payload = req.body;
    if (!payload.versionId || !payload.key) return res.status(400).json({ error: 'versionId and key required' });
    const version = await getPipelineVersionById(payload.versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const n = await createNode(payload);
    res.status(201).json(n);
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

    const nodes = await listNodesByVersion(versionId);
    res.json(nodes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const n = await getNodeById(req.params.id);
    if (!n) return res.status(404).json({ error: 'not found' });
    const version = await getPipelineVersionById(n.versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await getNodeById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const version = await getPipelineVersionById(existing.versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    const n = await updateNode(req.params.id, req.body);
    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/fields', async (req, res) => {
  try {
    const existing = await getNodeById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const version = await getPipelineVersionById(existing.versionId);
    if (!version) return res.status(404).json({ error: 'version not found' });
    const pipeline = await getPipelineById(version.pipelineId);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    const n = await updateNodeFields(req.params.id, req.body);
    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
