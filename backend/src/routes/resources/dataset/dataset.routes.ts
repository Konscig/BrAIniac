import express from 'express';
import {
  createDatasetForUser,
  deleteDatasetByIdForUser,
  getDatasetByIdForUser,
  listDatasetsForOwner,
  listDatasetsForPipelineForUser,
  updateDatasetForUser,
} from '../../../services/application/dataset/dataset.application.service.js';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { optionalId, requiredId } from '../../shared/req-parse.js';
import { mapDatasetCreateDTO } from '../../shared/create-dto.mappers.js';
import { mapDatasetPatchDTO } from '../../shared/patch-dto.mappers.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req: any, res) => {
  try {
    const dto = mapDatasetCreateDTO(req.body);

    const d = await createDatasetForUser(dto, req.user.user_id);
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

    const patch = mapDatasetPatchDTO(req.body);
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
