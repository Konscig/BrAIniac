import express from 'express';
import { createTool, listTools, getToolById, deleteTool } from '../services/tool.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { kind, name, version, configJson } = req.body;
    if (!kind || !name || !version) return res.status(400).json({ error: 'kind, name and version required' });
    const t = await createTool({ kind, name, version, configJson });
    res.status(201).json(t);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await listTools();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getToolById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteTool(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
