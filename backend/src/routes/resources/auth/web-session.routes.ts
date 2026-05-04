import express from 'express';
import {
  readWebRefreshCookie,
  refreshBrowserWebSession,
  revokeBrowserWebSession,
  serializeClearWebRefreshCookie,
  serializeWebRefreshCookie,
} from '../../../services/application/auth/web-session.application.service.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = readWebRefreshCookie(req.headers.cookie);
    const refreshed = await refreshBrowserWebSession(refreshToken);
    res.setHeader('Set-Cookie', serializeWebRefreshCookie(refreshed.refreshToken, refreshed.cookie));
    res.json({
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    });
  } catch (err) {
    res.setHeader('Set-Cookie', serializeClearWebRefreshCookie());
    return sendRouteError(res, err);
  }
});

router.post('/revoke', (req, res) => {
  const refreshToken = readWebRefreshCookie(req.headers.cookie);
  const result = revokeBrowserWebSession(refreshToken);
  res.setHeader('Set-Cookie', serializeClearWebRefreshCookie());
  res.json(result);
});

export default router;
