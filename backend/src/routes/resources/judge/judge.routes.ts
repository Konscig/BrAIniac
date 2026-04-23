import express from 'express';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { sendRouteError } from '../../shared/route-error.js';
import { runAssessment } from '../../../services/application/judge/judge.service.js';
import type { AssessItem } from '../../../services/application/judge/judge.service.js';

const router = express.Router();
router.use(requireAuth);

/**
 * POST /judge/assess
 *
 * Тело запроса:
 * {
 *   "pipeline_id": 1,
 *   "weight_profile": "rag",          // необязательно, default = "default"
 *   "items": [
 *     {
 *       "item_key": "q001",
 *       "input": { "question": "..." },
 *       "agent_output": { "text": "...", "tool_call_trace": [] },
 *       "reference": { "answer": "...", "rubric": "..." }
 *     }
 *   ]
 * }
 *
 * Ответ: полный отчёт оценки. Результат также сохраняется в Pipeline.score и Pipeline.report_json.
 */
router.post('/assess', async (req: any, res) => {
  try {
    const body = req.body ?? {};
    const pipelineId = Number(body.pipeline_id);
    if (!Number.isInteger(pipelineId) || pipelineId <= 0) {
      return res.status(400).json({ error: 'pipeline_id required' });
    }
    const items: AssessItem[] = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: 'items array required and must not be empty' });
    }

    const report = await runAssessment({
      pipeline_id: pipelineId,
      items,
      ...(body.weight_profile ? { weight_profile: String(body.weight_profile) } : {}),
    });

    return res.json(report);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
