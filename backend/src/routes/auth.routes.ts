import express from 'express';
import { signup, login, refresh, logout } from '../services/auth.service.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) return res.status(400).json({ error: 'missing fields' });
    const user = await signup({ email, username, password });
    res.status(201).json(user);
  } catch (err: any) {
    console.error(err);
    if (err.message === 'user exists') return res.status(409).json({ error: 'user exists' });
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'missing fields' });
    const tokens = await login({ email, password, userAgent: req.headers['user-agent'] as string | undefined, ipAddress: req.ip });
    res.json(tokens);
  } catch (err: any) {
    console.error(err);
    res.status(401).json({ error: 'invalid credentials' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'missing refreshToken' });
    const t = await refresh(refreshToken);
    res.json(t);
  } catch (err: any) {
    console.error(err);
    res.status(401).json({ error: 'invalid refresh token' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { refreshId } = req.body;
    if (!refreshId) return res.status(400).json({ error: 'missing refreshId' });
    await logout(refreshId);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
