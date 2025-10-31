import express from 'express';
import { createEdge, listEdgesByVersion, getEdgeById, deleteEdge } from '../services/edge.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { versionId, fromNode, toNode, label } = req.body;
    if (!versionId || !fromNode || !toNode) return res.status(400).json({ error: 'versionId, fromNode and toNode required' });
    const e = await createEdge({ versionId, fromNode, toNode, label });
    res.status(201).json(e);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const versionId = req.query.versionId as string | undefined;
    const edges = await listEdgesByVersion(versionId);
    res.json(edges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const e = await getEdgeById(req.params.id);
    if (!e) return res.status(404).json({ error: 'not found' });
    res.json(e);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteEdge(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
