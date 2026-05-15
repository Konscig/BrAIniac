import express from 'express';
import { getRuntimeHealth } from '../../runtime/redis.health.js';
import { sendRouteError } from '../shared/route-error.js';

const router = express.Router();

router.get('/health', async (_req, res) => {
  try {
    const health = await getRuntimeHealth();
    res.json(health);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;

