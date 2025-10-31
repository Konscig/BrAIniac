import express from 'express';
import { createPipeline, getPipelineById, listPipelines, listPipelinesByOwner, updatePipeline, deletePipeline } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

// require authentication for all pipeline operations
router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const { projectId, name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const project = await getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== req.user.id) return res.status(403).json({ error: 'forbidden' });

    const p = await createPipeline({ projectId, name, description });
    res.status(201).json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    if (projectId) {
      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ error: 'project not found' });
      if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });
      const list = await listPipelines(projectId);
      return res.json(list);
    }

    // no projectId: return pipelines for all projects owned by the current user
    const ownerId = (req as any).user.id;
    const list = await listPipelinesByOwner(ownerId);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await getPipelineById(req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    const project = await getProjectById(p.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await getPipelineById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const project = await getProjectById(existing.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    const p = await updatePipeline(req.params.id, req.body);
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getPipelineById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const project = await getProjectById(existing.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.ownerId !== (req as any).user.id) return res.status(403).json({ error: 'forbidden' });

    await deletePipeline(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
