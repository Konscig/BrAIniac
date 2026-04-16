import express from 'express';
import {
  createNodeForUser,
  deleteNodeByIdForUser,
  getNodeByIdForUser,
  listNodesForOwner,
  listNodesForPipelineForUser,
  updateNodeForUser,
} from '../services/node.application.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { optionalFiniteNumber, optionalId, requiredFiniteNumber, requiredId } from './req-parse.js';
import { mapNodePatchDTO } from './patch-dto.mappers.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_pipeline_id = requiredId(req.body.fk_pipeline_id, 'fk_pipeline_id and fk_type_id required');
    const fk_type_id = requiredId(req.body.fk_type_id, 'fk_pipeline_id and fk_type_id required');
    const fk_sub_pipeline = optionalId(req.body.fk_sub_pipeline, 'invalid fk_sub_pipeline');
    const top_k = requiredFiniteNumber(req.body.top_k, 'top_k must be a number');

    if (req.body.ui_json === undefined) {
      return res.status(400).json({ error: 'ui_json required' });
    }

    const n = await createNodeForUser({
      fk_pipeline_id,
      fk_type_id,
      ...(fk_sub_pipeline !== undefined ? { fk_sub_pipeline } : {}),
      top_k,
      ui_json: req.body.ui_json,
      ...(req.body.output_json !== undefined ? { output_json: req.body.output_json } : {}),
    }, req.user.user_id);
    res.status(201).json(n);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const pipelineId = optionalId(req.query.fk_pipeline_id, 'invalid fk_pipeline_id');
    if (pipelineId !== undefined) {

      const nodes = await listNodesForPipelineForUser(pipelineId, (req as any).user.user_id);
      return res.json(nodes);
    }

    const nodes = await listNodesForOwner((req as any).user.user_id);
    res.json(nodes);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const nodeId = requiredId(req.params.id, 'invalid id');

    const n = await getNodeByIdForUser(nodeId, (req as any).user.user_id);

    res.json(n);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const nodeId = requiredId(req.params.id, 'invalid id');

    const patch = mapNodePatchDTO(req.body);

    const n = await updateNodeForUser(nodeId, patch, (req as any).user.user_id);
    res.json(n);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const nodeId = requiredId(req.params.id, 'invalid id');

    await deleteNodeByIdForUser(nodeId, (req as any).user.user_id);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
