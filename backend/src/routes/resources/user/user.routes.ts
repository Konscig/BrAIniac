import express from 'express';
import { getUserByIdForSelf } from '../../../services/application/user/user.application.service.js';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requiredId } from '../../shared/req-parse.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

router.use(requireAuth);

router.get('/me', async (req: any, res) => {
  res.json(req.user);
});

router.get('/:id', async (req: any, res) => {
  try {
    const userId = requiredId(req.params.id, 'invalid id');

    const user = await getUserByIdForSelf(userId, req.user.user_id);
    res.json(user);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
