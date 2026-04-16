import express from 'express';
import {
  createDatasetForUser,
  deleteDatasetByIdForUser,
  getDatasetByIdForUser,
  listDatasetsForOwner,
  listDatasetsForPipelineForUser,
  updateDatasetForUser,
} from '../services/dataset.application.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { optionalId, requiredId, requiredNonEmptyString } from './req-parse.js';
import { sendRouteError } from './route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res) => {
  try {
    const fk_pipeline_id = requiredId(req.body.fk_pipeline_id, 'fk_pipeline_id and uri required');
    const uri = requiredNonEmptyString(req.body.uri, 'fk_pipeline_id and uri required');

    const d = await createDatasetForUser({
      fk_pipeline_id,
      uri,
      ...(req.body.desc !== undefined ? { desc: req.body.desc } : {}),
    }, req.user.user_id);
    res.status(201).json(d);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/', async (req: any, res) => {
  try {
    const pipelineId = optionalId(req.query.fk_pipeline_id, 'invalid fk_pipeline_id');
    if (pipelineId !== undefined) {

      const list = await listDatasetsForPipelineForUser(pipelineId, req.user.user_id);
      return res.json(list);
    }

    const r = await listDatasetsForOwner(req.user.user_id);
    res.json(r);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const datasetId = requiredId(req.params.id, 'invalid id');

    const d = await getDatasetByIdForUser(datasetId, req.user.user_id);

    res.json(d);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const datasetId = requiredId(req.params.id, 'invalid id');

    const patch: any = {};
    if (req.body.desc !== undefined) patch.desc = req.body.desc;
    if (req.body.uri !== undefined) patch.uri = req.body.uri;
    const updated = await updateDatasetForUser(datasetId, patch, req.user.user_id);
    res.json(updated);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const datasetId = requiredId(req.params.id, 'invalid id');

    await deleteDatasetByIdForUser(datasetId, req.user.user_id);
    res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
