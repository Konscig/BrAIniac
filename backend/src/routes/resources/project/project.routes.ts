import express from 'express';
import {
  createProjectForUser,
  deleteProjectByIdForUser,
  getProjectByIdForUser,
  listProjectsForUser,
  updateProjectByIdForUser,
} from '../services/project.application.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requiredId, requiredNonEmptyString } from './req-parse.js';
import { mapProjectPatchDTO } from './patch-dto.mappers.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res) => {
  try {
    const name = requiredNonEmptyString(req.body?.name, 'name required');
    const project = await createProjectForUser(name, req.user.user_id);
    res.status(201).json(project);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/', async (req: any, res) => {
  try {
    const projects = await listProjectsForUser(req.user.user_id);
    res.json(projects);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const projectId = requiredId(req.params.id, 'invalid id');

    const project = await getProjectByIdForUser(projectId, req.user.user_id);
    res.json(project);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const projectId = requiredId(req.params.id, 'invalid id');

    const patch = mapProjectPatchDTO(req.body);

    const project = await updateProjectByIdForUser(projectId, patch, req.user.user_id);
    res.json(project);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const projectId = requiredId(req.params.id, 'invalid id');

    await deleteProjectByIdForUser(projectId, req.user.user_id);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
