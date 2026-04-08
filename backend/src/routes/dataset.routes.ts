import express from 'express';
import { createDataset, listDatasets, listDatasetsByOwner, getDatasetById, updateDataset, deleteDataset } from '../services/dataset.service.js';
import { getPipelineById } from '../services/pipeline.service.js';
import { getProjectById } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res) => {
  try {
    const fk_pipeline_id = parseId(req.body.fk_pipeline_id);
    if (!fk_pipeline_id || !req.body.uri) {
      return res.status(400).json({ error: 'fk_pipeline_id and uri required' });
    }

    const pipeline = await getPipelineById(fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    const d = await createDataset({
      fk_pipeline_id,
      uri: req.body.uri,
      ...(req.body.desc !== undefined ? { desc: req.body.desc } : {}),
    });
    res.status(201).json(d);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req: any, res) => {
  try {
    const pipelineRaw = req.query.fk_pipeline_id as string | undefined;
    if (pipelineRaw !== undefined) {
      const pipelineId = parseId(pipelineRaw);
      if (!pipelineId) return res.status(400).json({ error: 'invalid fk_pipeline_id' });

      const pipeline = await getPipelineById(pipelineId);
      if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
      const project = await getProjectById(pipeline.fk_project_id);
      if (!project) return res.status(404).json({ error: 'project not found' });
      if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

      const list = await listDatasets(pipelineId);
      return res.json(list);
    }

    const r = await listDatasetsByOwner(req.user.user_id);
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const datasetId = parseId(req.params.id);
    if (!datasetId) return res.status(400).json({ error: 'invalid id' });

    const d = await getDatasetById(datasetId);
    if (!d) return res.status(404).json({ error: 'not found' });

    const pipeline = await getPipelineById(d.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    res.json(d);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const datasetId = parseId(req.params.id);
    if (!datasetId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getDatasetById(datasetId);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const pipeline = await getPipelineById(existing.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    const patch: any = {};
    if (req.body.desc !== undefined) patch.desc = req.body.desc;
    if (req.body.uri !== undefined) patch.uri = req.body.uri;
    const updated = await updateDataset(datasetId, patch);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const datasetId = parseId(req.params.id);
    if (!datasetId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getDatasetById(datasetId);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const pipeline = await getPipelineById(existing.fk_pipeline_id);
    if (!pipeline) return res.status(404).json({ error: 'pipeline not found' });
    const project = await getProjectById(pipeline.fk_project_id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    await deleteDataset(datasetId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
