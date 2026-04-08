import express from 'express';
import { createPipeline, getPipelineById, listPipelines, listPipelinesByOwner, updatePipeline, deletePipeline } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_project_id = parseId(req.body.fk_project_id);
    const max_time = Number(req.body.max_time);
    const max_cost = Number(req.body.max_cost);
    const max_reject = Number(req.body.max_reject);
    const score = req.body.score === undefined || req.body.score === null ? undefined : Number(req.body.score);

    if (!fk_project_id) return res.status(400).json({ error: 'fk_project_id required' });
    if (!req.body.name) return res.status(400).json({ error: 'name required' });
    if (!Number.isFinite(max_time) || !Number.isFinite(max_cost) || !Number.isFinite(max_reject)) {
      return res.status(400).json({ error: 'max_time, max_cost and max_reject must be numbers' });
    }
    if (score !== undefined && !Number.isFinite(score)) {
      return res.status(400).json({ error: 'score must be a number' });
    }

    const project = await getProjectById(fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    const p = await createPipeline({
      fk_project_id,
      name: req.body.name,
      max_time,
      max_cost,
      max_reject,
      ...(score !== undefined ? { score } : {}),
      ...(req.body.report_json !== undefined ? { report_json: req.body.report_json } : {}),
    });
    res.status(201).json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projectIdRaw = req.query.fk_project_id as string | undefined;
    if (projectIdRaw !== undefined) {
      const projectId = parseId(projectIdRaw);
      if (!projectId) return res.status(400).json({ error: 'invalid fk_project_id' });

      const project = await getProjectById(projectId);
      if (!project) return res.status(404).json({ error: 'project not found' });
      if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });
      const list = await listPipelines(projectId);
      return res.json(list);
    }

    const list = await listPipelinesByOwner((req as any).user.user_id);
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pipelineId = parseId(req.params.id);
    if (!pipelineId) return res.status(400).json({ error: 'invalid id' });

    const p = await getPipelineById(pipelineId);
    if (!p) return res.status(404).json({ error: 'not found' });
    const project = await getProjectById(p.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const pipelineId = parseId(req.params.id);
    if (!pipelineId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getPipelineById(pipelineId);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const project = await getProjectById(existing.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    const patch: any = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.max_time !== undefined) {
      const value = Number(req.body.max_time);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid max_time' });
      patch.max_time = value;
    }
    if (req.body.max_cost !== undefined) {
      const value = Number(req.body.max_cost);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid max_cost' });
      patch.max_cost = value;
    }
    if (req.body.max_reject !== undefined) {
      const value = Number(req.body.max_reject);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid max_reject' });
      patch.max_reject = value;
    }
    if (req.body.score !== undefined) {
      if (req.body.score === null) patch.score = null;
      else {
        const value = Number(req.body.score);
        if (!Number.isFinite(value)) return res.status(400).json({ error: 'invalid score' });
        patch.score = value;
      }
    }
    if (req.body.report_json !== undefined) patch.report_json = req.body.report_json;

    const p = await updatePipeline(pipelineId, patch);
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pipelineId = parseId(req.params.id);
    if (!pipelineId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getPipelineById(pipelineId);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const project = await getProjectById(existing.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== (req as any).user.user_id) return res.status(403).json({ error: 'forbidden' });

    await deletePipeline(pipelineId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
