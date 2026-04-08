import express from 'express';
import { createTool, listTools, getToolById, updateTool, deleteTool } from '../services/tool.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { name, config_json } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const t = await createTool({ name, config_json });
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
    const toolId = parseId(req.params.id);
    if (!toolId) return res.status(400).json({ error: 'invalid id' });

    const item = await getToolById(toolId);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const toolId = parseId(req.params.id);
    if (!toolId) return res.status(400).json({ error: 'invalid id' });

    const item = await getToolById(toolId);
    if (!item) return res.status(404).json({ error: 'not found' });

    const patch: any = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.config_json !== undefined) patch.config_json = req.body.config_json;
    const updated = await updateTool(toolId, patch);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const toolId = parseId(req.params.id);
    if (!toolId) return res.status(400).json({ error: 'invalid id' });
    await deleteTool(toolId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
