import express from 'express';
import {
  createDatasetForUser,
  deleteDatasetByIdForUser,
  getDatasetByIdForUser,
  listDatasetsForOwner,
  listDatasetsForPipelineForUser,
  uploadDatasetForUser,
  updateDatasetForUser,
} from '../../../services/application/dataset/dataset.application.service.js';
import { persistRagCorpusUpload } from '../../../services/application/dataset/dataset.upload.service.js';
import { HttpError } from '../../../common/http-error.js';
import { RAG_DATASET_ERROR_CODES } from '../../../services/application/tool/contracts/rag-dataset.constants.js';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { optionalId, requiredId, requiredNonEmptyString } from '../../shared/req-parse.js';
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

router.post('/upload', async (req: any, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawKind = typeof body.kind === 'string' ? body.kind.trim().toLowerCase() : '';
    const kind = rawKind === '' ? 'golden' : rawKind;

    if (kind === 'rag-corpus') {
      const filename = requiredNonEmptyString(body.filename, 'filename required');
      const contentBase64 = requiredNonEmptyString(body.content_base64, 'content_base64 required');
      const result = await persistRagCorpusUpload({
        filename,
        contentBase64,
        ownerToken: `user_${req.user.user_id}`,
      });
      res.status(201).json(result);
      return;
    }

    if (kind !== 'golden') {
      throw new HttpError(400, {
        code: RAG_DATASET_ERROR_CODES.INVALID_KIND,
        error: `Unknown kind: ${rawKind}`,
        details: { received: rawKind, allowed: ['golden', 'rag-corpus'] },
      });
    }

    const dataset = await uploadDatasetForUser(
      {
        fk_pipeline_id: requiredId(body.fk_pipeline_id, 'fk_pipeline_id required'),
        filename: requiredNonEmptyString(body.filename, 'filename required'),
        content_base64: requiredNonEmptyString(body.content_base64, 'content_base64 required'),
        ...(typeof body.mime_type === 'string' ? { mime_type: body.mime_type } : {}),
        ...(body.desc !== undefined ? { desc: body.desc } : {}),
      },
      req.user.user_id,
    );
    res.status(201).json(dataset);
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
