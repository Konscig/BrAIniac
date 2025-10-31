import express from 'express';
import { createNode, updateNode, getNodeById, listNodesByVersion, updateNodeFields } from '../services/node.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.versionId || !payload.key) return res.status(400).json({ error: 'versionId and key required' });
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
    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const n = await updateNode(req.params.id, req.body);
    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/fields', async (req, res) => {
  try {
    const n = await updateNodeFields(req.params.id, req.body);
    res.json(n);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
