import express from 'express';
import { signup, login } from '../services/auth.service.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    await signup({ email, password });
    const tokens = await login({ email, password });
    res.status(201).json(tokens);
  } catch (err: any) {
    console.error(err);
    if (err.message === 'user exists') return res.status(409).json({ error: 'user exists' });
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const tokens = await login({ email, password });
    res.json(tokens);
  } catch (err: any) {
    console.error(err);
    res.status(401).json({ error: 'invalid credentials' });
  }
});

export default router;
