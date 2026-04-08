import express from 'express';
import { createNodeType, getNodeTypeById, listNodeTypes, updateNodeType, deleteNodeType } from '../services/node_type.service.js';
import { getToolById } from '../services/tool.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const fk_tool_id = parseId(req.body.fk_tool_id);
    if (!fk_tool_id || !req.body.name || !req.body.desc) {
      return res.status(400).json({ error: 'fk_tool_id, name and desc required' });
    }

    const tool = await getToolById(fk_tool_id);
    if (!tool) return res.status(404).json({ error: 'tool not found' });

    const item = await createNodeType({
      fk_tool_id,
      name: req.body.name,
      desc: req.body.desc,
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const toolRaw = req.query.fk_tool_id as string | undefined;
    if (toolRaw !== undefined) {
      const toolId = parseId(toolRaw);
      if (!toolId) return res.status(400).json({ error: 'invalid fk_tool_id' });
      const items = await listNodeTypes(toolId);
      return res.json(items);
    }

    const items = await listNodeTypes();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const typeId = parseId(req.params.id);
    if (!typeId) return res.status(400).json({ error: 'invalid id' });

    const item = await getNodeTypeById(typeId);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const typeId = parseId(req.params.id);
    if (!typeId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getNodeTypeById(typeId);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const patch: any = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.desc !== undefined) patch.desc = req.body.desc;

    const item = await updateNodeType(typeId, patch);
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const typeId = parseId(req.params.id);
    if (!typeId) return res.status(400).json({ error: 'invalid id' });

    await deleteNodeType(typeId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
