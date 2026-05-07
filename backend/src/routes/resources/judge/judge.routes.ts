import express from 'express';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { sendRouteError } from '../../shared/route-error.js';
import { runAssessment } from '../../../services/application/judge/judge.service.js';
import type { AssessItem } from '../../../services/application/judge/judge.service.js';
import { judgeChat } from '../../../services/application/judge/judge.chat.service.js';
import { ensurePipelineOwnedByUser } from '../../../services/core/ownership.service.js';

const router = express.Router();
router.use(requireAuth);

/**
 * POST /judge/assessments
 *
 * Синхронная оценка пайплайна по набору тестовых item'ов (MVP-режим).
 * Результат сохраняется в Pipeline.score, Pipeline.report_json и Node.output_json.judge.
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
 * Ответ: полный отчёт оценки (200 OK).
 */
router.post('/assessments', async (req: any, res) => {
  try {
    const body = req.body ?? {};
    const pipelineId = Number(body.pipeline_id);
    if (!Number.isInteger(pipelineId) || pipelineId <= 0) {
      return res.status(400).json({ error: 'pipeline_id required' });
    }
    const items: AssessItem[] | undefined = Array.isArray(body.items) ? body.items : undefined;
    const datasetId = Number.isInteger(Number(body.dataset_id)) && Number(body.dataset_id) > 0
      ? Number(body.dataset_id)
      : undefined;

    if (!items?.length && datasetId === undefined) {
      return res.status(400).json({ error: 'either items[] or dataset_id is required' });
    }

    const sample = body.sample && typeof body.sample === 'object' && !Array.isArray(body.sample)
      ? {
          ...(typeof body.sample.fraction === 'number' ? { fraction: body.sample.fraction } : {}),
          ...(Number.isInteger(body.sample.size) ? { size: body.sample.size } : {}),
          ...(typeof body.sample.seed === 'number' ? { seed: body.sample.seed } : {}),
        }
      : undefined;

    await ensurePipelineOwnedByUser(pipelineId, req.user.user_id);

    const report = await runAssessment({
      pipeline_id: pipelineId,
      user_id: req.user.user_id,
      ...(items?.length ? { items } : {}),
      ...(datasetId !== undefined ? { dataset_id: datasetId } : {}),
      ...(sample ? { sample } : {}),
      ...(body.weight_profile ? { weight_profile: String(body.weight_profile) } : {}),
    });

    return res.json(report);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

/**
 * POST /judge/chat
 *
 * Чат с ИИ-судьёй. Судья знает о пайплайне, может вызывать инструменты
 * для получения деталей узлов и отчётов оценки.
 *
 * Тело: { pipeline_id, message, history?, focused_node_id? }
 * Ответ: { reply, tool_calls_used }
 */
router.post('/chat', async (req: any, res) => {
  try {
    const body = req.body ?? {};
    const pipelineId = Number(body.pipeline_id);
    if (!Number.isInteger(pipelineId) || pipelineId <= 0) {
      return res.status(400).json({ error: 'pipeline_id required' });
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    await ensurePipelineOwnedByUser(pipelineId, req.user.user_id);

    const result = await judgeChat({
      pipeline_id: pipelineId,
      message,
      history: Array.isArray(body.history) ? body.history : [],
      ...(body.focused_node_id ? { focused_node_id: Number(body.focused_node_id) } : {}),
    });

    return res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
