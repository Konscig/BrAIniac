import express from 'express';
import { isHttpError } from '../common/http-error.js';
import {
  createEdgeForUser,
  deleteEdgeByIdForUser,
  getEdgeByIdForUser,
  listEdgesForPipelineForUser,
} from '../services/edge.application.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

function sendError(res: express.Response, err: unknown) {
  if (isHttpError(err)) {
    return res.status(err.status).json(err.body);
  }

  console.error(err);
  return res.status(500).json({ error: 'internal error' });
}

router.post('/', async (req: any, res: any) => {
  try {
    const fk_from_node = parseId(req.body.fk_from_node);
    const fk_to_node = parseId(req.body.fk_to_node);
    if (!fk_from_node || !fk_to_node) {
      return res.status(400).json({ error: 'fk_from_node and fk_to_node required' });
    }

    const e = await createEdgeForUser(fk_from_node, fk_to_node, req.user.user_id);
    res.status(201).json(e);
  } catch (err) {
    return sendError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const pipelineId = parseId(req.query.fk_pipeline_id);
    if (!pipelineId) return res.status(400).json({ error: 'fk_pipeline_id required' });

    const edges = await listEdgesForPipelineForUser(pipelineId, (req as any).user.user_id);
    res.json(edges);
  } catch (err) {
    return sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const edgeId = parseId(req.params.id);
    if (!edgeId) return res.status(400).json({ error: 'invalid id' });

    const e = await getEdgeByIdForUser(edgeId, (req as any).user.user_id);

    res.json(e);
  } catch (err) {
    return sendError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const edgeId = parseId(req.params.id);
    if (!edgeId) return res.status(400).json({ error: 'invalid id' });

    await deleteEdgeByIdForUser(edgeId, (req as any).user.user_id);
    res.status(204).end();
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
