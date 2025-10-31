import express from 'express';
import { createAgent, updateAgent, getAgentById, listAgentsByProject, updateAgentConfig, deleteAgent } from '../services/agent.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { projectId, name, description, configJson, image } = req.body;
    if (!name || !image) return res.status(400).json({ error: 'name and image required' });
    const a = await createAgent({ projectId, name, description, configJson, image });
    res.status(201).json(a);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const r = await listAgentsByProject(projectId);
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const a = await getAgentById(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    res.json(a);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const a = await updateAgent(req.params.id, req.body);
    res.json(a);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/config', async (req, res) => {
  try {
    const cfg = req.body;
    const a = await updateAgentConfig(req.params.id, cfg);
    res.json(a);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteAgent(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
