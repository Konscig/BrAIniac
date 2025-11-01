import express from 'express';
import { createRun, startRun, completeRun, getRunById, listRuns } from '../services/run.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { pipelineVersion, author, mode } = req.body;
    if (!pipelineVersion || !mode) return res.status(400).json({ error: 'pipelineVersion and mode required' });
    const r = await createRun({ pipelineVersion, author, mode });
    res.status(201).json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const r = await startRun(req.params.id);
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const { success } = req.body;
    const r = await completeRun(req.params.id, !!success);
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await getRunById(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await listRuns();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
