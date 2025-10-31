import express from 'express';
import { createPipeline, getPipelineById, listPipelines, updatePipeline, deletePipeline } from '../services/pipeline.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { projectId, name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
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
    const list = await listPipelines(projectId);
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
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const p = await updatePipeline(req.params.id, req.body);
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deletePipeline(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
