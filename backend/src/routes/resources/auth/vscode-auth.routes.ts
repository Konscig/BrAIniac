import express from 'express';
import { HttpError } from '../../../common/http-error.js';
import { resolveMcpAuthContext } from '../../../mcp/mcp.auth.js';
import {
  completeVscodeAuthRequest,
  exchangeVscodeAuthRequest,
  startVscodeAuthRequest,
} from '../../../services/application/auth/vscode-auth.application.service.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

function unauthorizedError() {
  return new HttpError(401, {
    ok: false,
    code: 'UNAUTHORIZED',
    message: 'authentication required',
  });
}

router.post('/start', (req, res) => {
  try {
    const result = startVscodeAuthRequest({
      callback: req.body?.callback,
      mcpBaseUrl: req.body?.mcpBaseUrl,
    });
    res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/complete', async (req, res) => {
  try {
    let auth;
    try {
      auth = await resolveMcpAuthContext(req);
    } catch {
      throw unauthorizedError();
    }

    const result = completeVscodeAuthRequest({
      state: req.body?.state,
      userId: auth.userId,
      accessToken: auth.accessToken,
    });
    res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/exchange', (req, res) => {
  try {
    const result = exchangeVscodeAuthRequest(req.body?.state);
    res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
