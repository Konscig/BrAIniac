import express from 'express';
import { createDataset, listDatasets, getDatasetById, deleteDataset } from '../services/dataset.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { projectId, name, uri, configJson } = req.body;
    if (!name || !uri) return res.status(400).json({ error: 'name and uri required' });
    const d = await createDataset({ projectId, name, uri, configJson });
    res.status(201).json(d);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const r = await listDatasets(projectId);
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const d = await getDatasetById(req.params.id);
    if (!d) return res.status(404).json({ error: 'not found' });
    res.json(d);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteDataset(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
