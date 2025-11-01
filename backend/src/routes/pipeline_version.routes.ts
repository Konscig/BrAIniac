import express from 'express';
import { createPipelineVersion, listPipelineVersions, getPipelineVersionById, updatePipelineVersion } from '../services/pipeline_version.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { pipelineId, number, authorId, state, metadataJson } = req.body;
    if (!pipelineId || number === undefined) return res.status(400).json({ error: 'pipelineId and number required' });
    const v = await createPipelineVersion({ pipelineId, number, authorId, state, metadataJson });
    res.status(201).json(v);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const pipelineId = req.query.pipelineId as string | undefined;
    const items = await listPipelineVersions(pipelineId);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getPipelineVersionById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await updatePipelineVersion(req.params.id, req.body);
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
