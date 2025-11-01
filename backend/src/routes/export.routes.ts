import express from 'express';
import { createExport, listExports, getExportById, deleteExport } from '../services/export.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { projectId, type, uri, configJson } = req.body;
    if (!type || !uri) return res.status(400).json({ error: 'type and uri required' });
    const e = await createExport({ projectId, type, uri, configJson });
    res.status(201).json(e);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const items = await listExports(projectId);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getExportById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteExport(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
