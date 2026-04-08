import express from 'express';
import { createProject, updateProject, deleteProject, getProjectById, listProjectsByOwner } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const project = await createProject({ fk_user_id: req.user.user_id, name });
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req: any, res) => {
  try {
    const projects = await listProjectsByOwner(req.user.user_id);
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'invalid id' });

    const project = await getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (project.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getProjectById(projectId);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });
    const project = await updateProject(projectId, req.body);
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'invalid id' });

    const existing = await getProjectById(projectId);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.fk_user_id !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });
    await deleteProject(projectId);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
