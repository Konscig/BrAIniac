import express from 'express';
import { findUserById } from '../services/user.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { parseId } from './id.utils.js';

const router = express.Router();

router.use(requireAuth);

router.get('/me', async (req: any, res) => {
  res.json(req.user);
});

router.get('/:id', async (req: any, res) => {
  try {
    const userId = parseId(req.params.id);
    if (!userId) return res.status(400).json({ error: 'invalid id' });
    if (userId !== req.user.user_id) return res.status(403).json({ error: 'forbidden' });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
