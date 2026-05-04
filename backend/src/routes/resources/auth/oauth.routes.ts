import express from 'express';
import { HttpError } from '../../../common/http-error.js';
import {
  DEFAULT_MCP_SCOPE,
  MCP_DEV_TOKEN_SCOPE,
  MCP_SCOPES,
  refreshVscodeOAuthSession,
  revokeVscodeOAuthSession,
} from '../../../services/application/auth/oauth-token.application.service.js';
import { sendRouteError } from '../../shared/route-error.js';

const router = express.Router();

function originFor(req: express.Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

function mcpResourceFor(req: express.Request): string {
  const mcpPath = process.env.MCP_PATH || '/mcp';
  return `${originFor(req)}${mcpPath.startsWith('/') ? mcpPath : `/${mcpPath}`}`;
}

router.get('/authorization-server', (req, res) => {
  const origin = originFor(req);
  res.json({
    issuer: origin,
    authorization_endpoint: `${origin}/auth/vscode/start`,
    token_endpoint: `${origin}/auth/oauth/token`,
    revocation_endpoint: `${origin}/auth/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...MCP_SCOPES, MCP_DEV_TOKEN_SCOPE],
  });
});

router.get('/protected-resource', (req, res) => {
  res.json({
    resource: mcpResourceFor(req),
    authorization_servers: [`${originFor(req)}/auth/oauth/authorization-server`],
    scopes_supported: [...MCP_SCOPES, MCP_DEV_TOKEN_SCOPE],
    bearer_methods_supported: ['header'],
  });
});

router.post('/token', async (req, res) => {
  try {
    const grantType = req.body?.grant_type;
    if (grantType !== 'refresh_token') {
      throw new HttpError(400, {
        ok: false,
        code: 'UNSUPPORTED_GRANT_TYPE',
        message: 'only refresh_token grant is supported for local VS Code OAuth',
      });
    }

    const result = await refreshVscodeOAuthSession({ refreshToken: req.body?.refresh_token });
    res.json(result);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.post('/revoke', (req, res) => {
  try {
    const token = req.body?.token ?? req.body?.refresh_token;
    res.json({
      ...revokeVscodeOAuthSession({ token }),
      scope: DEFAULT_MCP_SCOPE,
    });
  } catch (err) {
    return sendRouteError(res, err);
  }
});

export default router;
