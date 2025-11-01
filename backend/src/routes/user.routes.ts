import express from 'express';
import { createUser, findUserById, findUserByEmail } from '../services/user.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'email, username and password are required' });
    }
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'user exists' });
    const user = await createUser({ email, username, passwordHash: password });
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/me', requireAuth, async (req: any, res) => {
  res.json(req.user);
});

router.get('/:id', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
