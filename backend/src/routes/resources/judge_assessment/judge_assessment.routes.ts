import express from 'express';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requiredId } from '../../shared/req-parse.js';
import { sendRouteError } from '../../shared/route-error.js';
import {
  compareAssessments,
  getAssessment,
  startAssessment,
} from '../../../services/application/judge/judge_assessment.application.service.js';

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req: any, res) => {
  try {
    const idempotencyKey = req.get('x-idempotency-key') ?? undefined;
    const created = await startAssessment(req.body ?? {}, req.user.user_id, idempotencyKey);
    return res.status(202).json({
      assessment_id: created.assessment_id,
      pipeline_id: created.fk_pipeline_id,
      dataset_id: created.fk_dataset_id,
      status: String(created.status).trim(),
      idempotency_key: created.idempotency_key,
      total_items: created.total_items,
      completed_items: created.completed_items,
      created_at: created.created_at,
      updated_at: created.updated_at,
      request: created.request_json,
    });
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const id = requiredId(req.params.id, 'invalid id');
    const result = await getAssessment(id, req.user.user_id);
    return res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/:id/comparison', async (req: any, res) => {
  try {
    const id = requiredId(req.params.id, 'invalid id');
    const against = requiredId(req.query.against, 'against required');
    const result = await compareAssessments(id, against, req.user.user_id);
    return res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
