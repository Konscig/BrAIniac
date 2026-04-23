import express from 'express';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requiredId } from '../../shared/req-parse.js';
import { sendRouteError } from '../../shared/route-error.js';
import {
  createGoldAnnotationForUser,
  createGoldAnnotationsBatchForUser,
  deleteGoldAnnotationForUser,
  listGoldAnnotationsForUser,
  reviseGoldAnnotationForUser,
} from '../../../services/application/gold_annotation/gold_annotation.application.service.js';

const datasetScopedRouter = express.Router({ mergeParams: true });
datasetScopedRouter.use(requireAuth);

datasetScopedRouter.post('/', async (req: any, res) => {
  try {
    const datasetId = requiredId(req.params.datasetId, 'invalid dataset id');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (Array.isArray(body.items)) {
      const created = await createGoldAnnotationsBatchForUser(datasetId, req.user.user_id, body.items);
      return res.status(201).json({ created });
    }
    const single = await createGoldAnnotationForUser(datasetId, req.user.user_id, body);
    return res.status(201).json(single);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

datasetScopedRouter.get('/', async (req: any, res) => {
  try {
    const datasetId = requiredId(req.params.datasetId, 'invalid dataset id');
    const annotationType = typeof req.query.annotation_type === 'string' ? req.query.annotation_type : undefined;
    const documentId = req.query.document_id ? Number(req.query.document_id) : undefined;
    const includeHistory = String(req.query.include_history ?? '').toLowerCase() === 'true';
    const items = await listGoldAnnotationsForUser(datasetId, req.user.user_id, {
      ...(annotationType !== undefined ? { annotation_type: annotationType } : {}),
      ...(documentId !== undefined ? { document_id: documentId } : {}),
      include_history: includeHistory,
    });
    return res.json({ dataset_id: datasetId, items, has_more: false });
  } catch (err) {
    return sendRouteError(res, err);
  }
});

const individualRouter = express.Router();
individualRouter.use(requireAuth);

individualRouter.put('/:id', async (req: any, res) => {
  try {
    const id = requiredId(req.params.id, 'invalid id');
    const payload = req.body && typeof req.body.payload === 'object' ? req.body.payload : null;
    if (!payload) {
      return res.status(400).json({ error: 'payload required' });
    }
    const updated = await reviseGoldAnnotationForUser(id, req.user.user_id, payload);
    return res.json(updated);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

individualRouter.delete('/:id', async (req: any, res) => {
  try {
    const id = requiredId(req.params.id, 'invalid id');
    await deleteGoldAnnotationForUser(id, req.user.user_id);
    return res.status(204).end();
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export { datasetScopedRouter as goldAnnotationDatasetRouter, individualRouter as goldAnnotationIndividualRouter };
