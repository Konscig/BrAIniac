import express from 'express';
import { createRefreshToken, findRefreshTokenByHash, expireRefreshTokenById } from '../services/refresh_token.service.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { userId, tokenHash, userAgent, ipAddress } = req.body;
    if (!userId || !tokenHash) return res.status(400).json({ error: 'userId and tokenHash required' });
    const rt = await createRefreshToken({ userId, tokenHash, userAgent, ipAddress });
    res.status(201).json(rt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.get('/by-hash/:hash', async (req, res) => {
  try {
    const rt = await findRefreshTokenByHash(req.params.hash);
    if (!rt) return res.status(404).json({ error: 'not found' });
    res.json(rt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/:id/expire', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await expireRefreshTokenById(id);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default router;
