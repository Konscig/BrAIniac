import type { Request } from 'express';
import { HttpError } from '../common/http-error.js';
import { verifyAccessToken } from '../services/core/jwt.service.js';
import { findUserById } from '../services/data/user.service.js';

export type McpUser = {
  user_id: number;
  email: string;
};

export type McpAuthContext = {
  user: McpUser;
  userId: number;
  accessToken: string;
};

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
  };
}

export async function resolveMcpAuthContext(req: Request): Promise<McpAuthContext> {
  const token = extractBearerToken(req.headers.authorization);
  return resolveMcpAuthContextFromToken(token);
}
