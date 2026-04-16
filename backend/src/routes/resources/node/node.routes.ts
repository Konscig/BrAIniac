import express from 'express';
import {
  createNodeForUser,
  deleteNodeByIdForUser,
  getNodeByIdForUser,
  listNodesForOwner,
  listNodesForPipelineForUser,
  updateNodeForUser,
} from '../../../services/application/node/node.application.service.js';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { optionalId, requiredId } from '../../shared/req-parse.js';
import { mapNodeCreateDTO } from '../../shared/create-dto.mappers.js';
import { mapNodePatchDTO } from '../../shared/patch-dto.mappers.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const dto = mapNodeCreateDTO(req.body);

    const n = await createNodeForUser(dto, req.user.user_id);
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
