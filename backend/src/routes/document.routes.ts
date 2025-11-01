import express from 'express';
import { createDocument, listDocuments, getDocumentById, deleteDocument } from '../services/document.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { projectId, datasetId, content, metadata } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const d = await createDocument({ projectId, datasetId, content, metadata });
    res.status(201).json(d);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const datasetId = req.query.datasetId as string | undefined;
    const docs = await listDocuments({ projectId, datasetId });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const d = await getDocumentById(req.params.id);
    if (!d) return res.status(404).json({ error: 'not found' });
    res.json(d);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteDocument(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
