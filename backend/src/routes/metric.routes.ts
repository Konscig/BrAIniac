import express from 'express';
import { createMetric, listMetrics, getMetricById } from '../services/metric.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { name, value } = req.body;
    if (!name || value === undefined) return res.status(400).json({ error: 'name and value required' });
    const m = await createMetric({ name, value });
    res.status(201).json(m);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await listMetrics();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getMetricById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
