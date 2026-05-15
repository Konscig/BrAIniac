import express from 'express';
import { loginAndIssueTokens, signupAndIssueTokens } from '../../../services/application/auth/auth.application.service.js';
import {
  issueBrowserWebSession,
  serializeWebRefreshCookie,
} from '../../../services/application/auth/web-session.application.service.js';
import { verifyAccessToken } from '../../../services/core/jwt.service.js';
import { enforceRateLimit, readRateLimitIntEnv } from '../../../runtime/rate-limit.service.js';
import { mapAuthCredentialsDTO } from '../../shared/create-dto.mappers.js';
import { sendRouteError } from '../../shared/route-error.js';
import oauthAuthRouter from './oauth.routes.js';
import webSessionRouter from './web-session.routes.js';
import vscodeAuthRouter from './vscode-auth.routes.js';

const router = express.Router();

router.use('/vscode', vscodeAuthRouter);
router.use('/oauth', oauthAuthRouter);
router.use('/web', webSessionRouter);

function userIdFromAccessToken(accessToken: string): number {
  const payload = verifyAccessToken(accessToken);
  const userId = Number(payload?.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('invalid access token');
  }
  return userId;
}

async function setBrowserRefreshCookie(res: express.Response, accessToken: string): Promise<void> {
  const session = await issueBrowserWebSession(userIdFromAccessToken(accessToken));
  res.setHeader('Set-Cookie', serializeWebRefreshCookie(session.refreshToken, session.cookie));
}

function authRateLimitScope(req: express.Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'unknown';
  return `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}:${email}`;
}

async function enforceAuthRateLimit(req: express.Request, action: 'login' | 'signup'): Promise<void> {
  await enforceRateLimit({
    bucket: `auth:${action}`,
    scope: authRateLimitScope(req),
    limit: readRateLimitIntEnv('AUTH_RATE_LIMIT_MAX', 20),
    windowMs: readRateLimitIntEnv('AUTH_RATE_LIMIT_WINDOW_MS', 60_000),
  });
}

router.post('/signup', async (req, res) => {
  try {
    await enforceAuthRateLimit(req, 'signup');
    const dto = mapAuthCredentialsDTO(req.body);
    const tokens = await signupAndIssueTokens(dto);
    await setBrowserRefreshCookie(res, tokens.accessToken);
    res.status(201).json(tokens);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/login', async (req, res) => {
  try {
    await enforceAuthRateLimit(req, 'login');
    const dto = mapAuthCredentialsDTO(req.body);
    const tokens = await loginAndIssueTokens(dto);
    await setBrowserRefreshCookie(res, tokens.accessToken);
    res.json(tokens);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
