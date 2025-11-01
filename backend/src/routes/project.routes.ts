import express from 'express';
import { createProject, updateProject, deleteProject, getProjectById, listProjectsByOwner } from '../services/project.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', requireAuth, async (req: any, res) => {
  try {
    const { name, description, config } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const ownerId = req.user.id;
    const project = await createProject({ ownerId, name, description, config });
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', requireAuth, async (req: any, res) => {
  try {
    const ownerId = req.user.id;
    const projects = await listProjectsByOwner(ownerId);
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', requireAuth, async (req: any, res) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (project.ownerId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', requireAuth, async (req: any, res) => {
  try {
    const existing = await getProjectById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.ownerId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    const project = await updateProject(req.params.id, req.body);
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', requireAuth, async (req: any, res) => {
  try {
    const existing = await getProjectById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.ownerId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    await deleteProject(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
