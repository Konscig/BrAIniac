import { randomBytes } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import { findUserById } from '../../data/user.service.js';
import { readAccessTokenExpiresAt, signAccessToken } from '../../core/jwt.service.js';

export const MCP_SCOPES = ['mcp:read', 'mcp:execute', 'mcp:export'] as const;
export const MCP_DEV_TOKEN_SCOPE = 'mcp:dev-token';
export const DEFAULT_MCP_SCOPE = MCP_SCOPES.join(' ');

type RefreshSession = {
  sessionId: string;
  userId: number;
  scope: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  revokedAt?: Date;
};

export type VscodeOAuthSessionResult = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresAt?: string;
  refreshExpiresAt: string;
  scope: string;
  sessionId: string;
};

export type VscodeOAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  session_id: string;
  refresh_expires_at: string;
};

const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const refreshSessions = new Map<string, RefreshSession>();

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

function nowPlus(ms: number): Date {
  return new Date(Date.now() + ms);
}

function invalidRefreshToken(): HttpError {
  return new HttpError(400, {
    ok: false,
    code: 'INVALID_REFRESH_TOKEN',
    message: 'invalid, expired, or revoked refresh token',
  });
}

function createRefreshSession(userId: number, scope: string): RefreshSession {
  const session: RefreshSession = {
    sessionId: createToken('bos'),
    userId,
    scope,
    refreshToken: createToken('brt'),
    refreshExpiresAt: nowPlus(readPositiveIntEnv('VSCODE_OAUTH_REFRESH_TTL_MS', DEFAULT_REFRESH_TTL_MS)),
  };
  refreshSessions.set(session.refreshToken, session);
  return session;
}

function assertActiveRefreshSession(refreshToken: unknown): RefreshSession {
  if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
    throw invalidRefreshToken();
  }

  const session = refreshSessions.get(refreshToken.trim());
  if (!session || session.revokedAt || session.refreshExpiresAt.getTime() <= Date.now()) {
    if (session) {
      refreshSessions.delete(session.refreshToken);
    }
    throw invalidRefreshToken();
  }

  return session;
}

function accessExpiresInSeconds(accessToken: string): number {
  const expiresAt = readAccessTokenExpiresAt(accessToken);
  if (!expiresAt) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
}

export function issueVscodeOAuthSession(input: {
  userId: number;
  accessToken: string;
  scope?: string;
}): VscodeOAuthSessionResult {
  const scope = input.scope || DEFAULT_MCP_SCOPE;
  const refreshSession = createRefreshSession(input.userId, scope);
  const expiresAt = readAccessTokenExpiresAt(input.accessToken);

  return {
    accessToken: input.accessToken,
    refreshToken: refreshSession.refreshToken,
    tokenType: 'Bearer',
    refreshExpiresAt: refreshSession.refreshExpiresAt.toISOString(),
    scope,
    sessionId: refreshSession.sessionId,
    ...(expiresAt ? { expiresAt } : {}),
  };
}

export async function refreshVscodeOAuthSession(input: {
  refreshToken: unknown;
}): Promise<VscodeOAuthTokenResponse> {
  const current = assertActiveRefreshSession(input.refreshToken);
  refreshSessions.delete(current.refreshToken);
  current.revokedAt = new Date();

  const user = await findUserById(current.userId);
  if (!user) {
    throw invalidRefreshToken();
  }

  const next = createRefreshSession(current.userId, current.scope);
  const accessToken = signAccessToken({
    sub: user.user_id,
    email: user.email,
    scope: current.scope,
  });

  return {
    access_token: accessToken,
    refresh_token: next.refreshToken,
    token_type: 'Bearer',
    expires_in: accessExpiresInSeconds(accessToken),
    scope: current.scope,
    session_id: next.sessionId,
    refresh_expires_at: next.refreshExpiresAt.toISOString(),
  };
}

export function revokeVscodeOAuthSession(input: { token: unknown }): { revoked: true } {
  if (typeof input.token === 'string') {
    const token = input.token.trim();
    const session = refreshSessions.get(token);
    if (session) {
      session.revokedAt = new Date();
      refreshSessions.delete(token);
    }
  }

  return { revoked: true };
}

export function clearVscodeOAuthSessionsForTests(): void {
  refreshSessions.clear();
}
