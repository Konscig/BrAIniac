import express from 'express';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { sendRouteError } from '../../shared/route-error.js';
import {
  getHistoryForOwner,
  sendChatMessage,
} from '../../../services/application/judge/judge_chat.application.service.js';

const router = express.Router();
router.use(requireAuth);

router.post('/chat', async (req: any, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await sendChatMessage(
      {
        project_id: Number(body.project_id),
        conversation_id: body.conversation_id ? Number(body.conversation_id) : undefined,
        assessment_id: body.assessment_id ? Number(body.assessment_id) : undefined,
        message: String(body.message ?? ''),
      },
      req.user.user_id,
    );
    return res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/history', async (req: any, res) => {
  try {
    const conversationId = Number(req.query.conversation_id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: 'conversation_id required' });
    }
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const beforeId = req.query.before_message_id ? Number(req.query.before_message_id) : undefined;
    const history = await getHistoryForOwner(conversationId, req.user.user_id, { limit, beforeId });
    return res.json(history);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
