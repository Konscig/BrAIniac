import type { Request } from 'express';
import { HttpError } from '../common/http-error.js';
import { verifyAccessToken } from '../services/core/jwt.service.js';
import { DEFAULT_MCP_SCOPE, MCP_DEV_TOKEN_SCOPE, MCP_SCOPES } from '../services/application/auth/oauth-token.application.service.js';
import { findUserById } from '../services/data/user.service.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

export type McpUser = {
  user_id: number;
  email: string;
};

export type McpAuthContext = {
  user: McpUser;
  userId: number;
  accessToken: string;
  scopes: string[];
};

export type McpScope = (typeof MCP_SCOPES)[number] | typeof MCP_DEV_TOKEN_SCOPE;

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    throw new HttpError(401, { error: 'unauthorized', code: 'MCP_UNAUTHORIZED' });
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (token.length === 0) {
    throw new HttpError(401, { error: 'unauthorized', code: 'MCP_UNAUTHORIZED' });
  }

  return token;
}

function getSubjectUserId(payload: unknown): number {
  const sub = typeof payload === 'object' && payload !== null ? (payload as { sub?: unknown }).sub : undefined;
  const userId = Number(sub);

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(401, { error: 'invalid token', code: 'MCP_INVALID_TOKEN' });
  }

  return userId;
}

function getScopes(payload: unknown): string[] {
  const rawScope = typeof payload === 'object' && payload !== null ? (payload as { scope?: unknown }).scope : undefined;
  const scope = typeof rawScope === 'string' && rawScope.trim().length > 0 ? rawScope : DEFAULT_MCP_SCOPE;
  return scope.split(/\s+/).filter(Boolean);
}

export async function resolveMcpAuthContextFromToken(accessToken: string): Promise<McpAuthContext> {
  const payload = verifyAccessToken(accessToken);
  if (!payload) {
    throw new HttpError(401, { error: 'invalid token', code: 'MCP_INVALID_TOKEN' });
  }

  const userId = getSubjectUserId(payload);
  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(401, { error: 'unauthorized', code: 'MCP_UNAUTHORIZED' });
  }

  return {
    user,
    userId: user.user_id,
    accessToken,
    scopes: getScopes(payload),
  };
}

export async function resolveMcpAuthContext(req: Request): Promise<McpAuthContext> {
  const token = extractBearerToken(req.headers.authorization);
  return resolveMcpAuthContextFromToken(token);
}

export function requireMcpUserId(extra: RequestHandlerExtra<ServerRequest, ServerNotification>): number {
  const userId = Number(extra.authInfo?.extra?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(401, { error: 'unauthorized', code: 'MCP_UNAUTHORIZED' });
  }
  return userId;
}

export function requireMcpScope(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  scope: McpScope,
): void {
  const scopes = Array.isArray(extra.authInfo?.scopes) ? extra.authInfo.scopes : DEFAULT_MCP_SCOPE.split(/\s+/);
  if (!scopes.includes(scope)) {
    throw new HttpError(403, { error: 'forbidden', code: 'MCP_SCOPE_FORBIDDEN', scope });
  }
}
