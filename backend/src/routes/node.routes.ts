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
import { parseId } from './id.utils.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res: any) => {
  try {
    const fk_pipeline_id = parseId(req.body.fk_pipeline_id);
    const fk_type_id = parseId(req.body.fk_type_id);
    let fk_sub_pipeline: number | undefined;
    if (req.body.fk_sub_pipeline !== undefined) {
      const parsedSubPipelineId = parseId(req.body.fk_sub_pipeline);
      if (!parsedSubPipelineId) {
        return res.status(400).json({ error: 'invalid fk_sub_pipeline' });
      }
      fk_sub_pipeline = parsedSubPipelineId;
    }
    const top_k = Number(req.body.top_k);

    if (!fk_pipeline_id || !fk_type_id) {
      return res.status(400).json({ error: 'fk_pipeline_id and fk_type_id required' });
    }
    if (!Number.isFinite(top_k)) {
      return res.status(400).json({ error: 'top_k must be a number' });
    }
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
    const pipelineRaw = req.query.fk_pipeline_id as string | undefined;
    if (pipelineRaw !== undefined) {
      const pipelineId = parseId(pipelineRaw);
      if (!pipelineId) return res.status(400).json({ error: 'invalid fk_pipeline_id' });

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
    const nodeId = parseId(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'invalid id' });

    const n = await getNodeByIdForUser(nodeId, (req as any).user.user_id);

    res.json(n);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const nodeId = parseId(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'invalid id' });

    const patch: any = {};
    if (req.body.fk_type_id !== undefined) {
      const fkType = parseId(req.body.fk_type_id);
      if (!fkType) return res.status(400).json({ error: 'invalid fk_type_id' });
      patch.fk_type_id = fkType;
    }
    if (req.body.fk_sub_pipeline !== undefined) {
      if (req.body.fk_sub_pipeline === null) {
        patch.fk_sub_pipeline = null;
      } else {
        const fkSubPipeline = parseId(req.body.fk_sub_pipeline);
        if (!fkSubPipeline) return res.status(400).json({ error: 'invalid fk_sub_pipeline' });
        patch.fk_sub_pipeline = fkSubPipeline;
      }
    }
    if (req.body.top_k !== undefined) {
      const topK = Number(req.body.top_k);
      if (!Number.isFinite(topK)) return res.status(400).json({ error: 'invalid top_k' });
      patch.top_k = topK;
    }
    if (req.body.ui_json !== undefined) patch.ui_json = req.body.ui_json;
    if (req.body.output_json !== undefined) patch.output_json = req.body.output_json;

    const n = await updateNodeForUser(nodeId, patch, (req as any).user.user_id);
    res.json(n);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const nodeId = parseId(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'invalid id' });

    await deleteNodeByIdForUser(nodeId, (req as any).user.user_id);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
