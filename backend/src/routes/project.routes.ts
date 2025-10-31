import express from 'express';
import { createProject, updateProject, deleteProject, getProjectById, listProjectsByOwner } from '../services/project.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { ownerId, name, description, config } = req.body;
    if (!ownerId || !name) return res.status(400).json({ error: 'ownerId and name required' });
    const project = await createProject({ ownerId, name, description, config });
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const ownerId = req.query.ownerId as string | undefined;
    const projects = await listProjectsByOwner(ownerId);
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const project = await updateProject(req.params.id, req.body);
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteProject(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
