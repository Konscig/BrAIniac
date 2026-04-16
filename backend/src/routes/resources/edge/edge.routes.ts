import express from 'express';
import {
  createEdgeForUser,
  deleteEdgeByIdForUser,
  getEdgeByIdForUser,
  listEdgesForPipelineForUser,
} from '../services/edge.application.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requiredId } from './req-parse.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_from_node = requiredId(req.body.fk_from_node, 'fk_from_node and fk_to_node required');
    const fk_to_node = requiredId(req.body.fk_to_node, 'fk_from_node and fk_to_node required');

    const e = await createEdgeForUser(fk_from_node, fk_to_node, req.user.user_id);
    res.status(201).json(e);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const pipelineId = requiredId(req.query.fk_pipeline_id, 'fk_pipeline_id required');

    const edges = await listEdgesForPipelineForUser(pipelineId, (req as any).user.user_id);
    res.json(edges);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const edgeId = requiredId(req.params.id, 'invalid id');

    const e = await getEdgeByIdForUser(edgeId, (req as any).user.user_id);

    res.json(e);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const edgeId = requiredId(req.params.id, 'invalid id');

    await deleteEdgeByIdForUser(edgeId, (req as any).user.user_id);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
