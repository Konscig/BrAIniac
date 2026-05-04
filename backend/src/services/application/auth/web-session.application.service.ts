import crypto from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import { readAccessTokenExpiresAt, signAccessToken } from '../../core/jwt.service.js';
import { findUserById } from '../../data/user.service.js';

export const WEB_REFRESH_COOKIE_NAME = process.env.WEB_REFRESH_COOKIE_NAME || 'brainiac_web_refresh';
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type WebRefreshSession = {
  sessionId: string;
  userId: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  revokedAt?: Date;
};

export type CookieConfig = {
  name: string;
  path: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  maxAgeSeconds: number;
};

export type WebRefreshIssueResult = {
  accessToken: string;
  expiresAt: string | undefined;
  refreshToken: string;
  cookie: CookieConfig;
};

const sessions = new Map<string, WebRefreshSession>();

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readCookieSecure(): boolean {
  const raw = process.env.WEB_REFRESH_COOKIE_SECURE;
  return raw ? raw.toLowerCase() !== 'false' : true;
}

function readCookieSameSite(): CookieConfig['sameSite'] {
  const raw = (process.env.WEB_REFRESH_COOKIE_SAMESITE || 'lax').toLowerCase();
  if (raw === 'strict') return 'Strict';
  if (raw === 'none') return 'None';
  return 'Lax';
}

export function getWebRefreshCookieConfig(maxAgeMs = readPositiveIntEnv('WEB_REFRESH_TTL_MS', DEFAULT_REFRESH_TTL_MS)): CookieConfig {
  return {
    name: WEB_REFRESH_COOKIE_NAME,
    path: '/auth/web',
    httpOnly: true,
    secure: readCookieSecure(),
    sameSite: readCookieSameSite(),
    maxAgeSeconds: Math.max(1, Math.floor(maxAgeMs / 1000)),
  };
}

export function serializeWebRefreshCookie(value: string, config = getWebRefreshCookieConfig()): string {
  const parts = [
    `${config.name}=${encodeURIComponent(value)}`,
    `Max-Age=${config.maxAgeSeconds}`,
    `Path=${config.path}`,
    'HttpOnly',
    `SameSite=${config.sameSite}`,
  ];
  if (config.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function serializeClearWebRefreshCookie(config = getWebRefreshCookieConfig(1000)): string {
  const parts = [
    `${config.name}=`,
    'Max-Age=0',
    `Path=${config.path}`,
    'HttpOnly',
    `SameSite=${config.sameSite}`,
  ];
  if (config.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function readWebRefreshCookie(cookieHeader: unknown): string | undefined {
  if (typeof cookieHeader !== 'string') return undefined;
  const wanted = `${WEB_REFRESH_COOKIE_NAME}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(wanted)) {
      return decodeURIComponent(trimmed.slice(wanted.length));
    }
  }
  return undefined;
}

function createToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

function createRefreshSession(userId: number): WebRefreshSession {
  const ttlMs = readPositiveIntEnv('WEB_REFRESH_TTL_MS', DEFAULT_REFRESH_TTL_MS);
  const session: WebRefreshSession = {
    sessionId: createToken('bws'),
    userId,
    refreshToken: createToken('bwr'),
    refreshExpiresAt: new Date(Date.now() + ttlMs),
  };
  sessions.set(session.refreshToken, session);
  return session;
}

function rejectRefresh(): never {
  throw new HttpError(401, {
    ok: false,
    code: 'WEB_REFRESH_INVALID',
    message: 'web refresh session expired',
  });
}

function assertActiveRefreshSession(refreshToken: unknown): WebRefreshSession {
  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    rejectRefresh();
  }

  const session = sessions.get(refreshToken.trim());
  if (!session || session.revokedAt || session.refreshExpiresAt.getTime() <= Date.now()) {
    if (session) {
      sessions.delete(session.refreshToken);
    }
    rejectRefresh();
  }

  return session;
}

function buildIssueResult(userId: number): WebRefreshIssueResult {
  const session = createRefreshSession(userId);
  const accessToken = signAccessToken({ sub: userId });
  return {
    accessToken,
    expiresAt: readAccessTokenExpiresAt(accessToken),
    refreshToken: session.refreshToken,
    cookie: getWebRefreshCookieConfig(),
  };
}

export function issueBrowserWebSession(userId: number): WebRefreshIssueResult {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(401, { error: 'invalid user' });
  }
  return buildIssueResult(userId);
}

export async function refreshBrowserWebSession(refreshToken: unknown): Promise<WebRefreshIssueResult> {
  const current = assertActiveRefreshSession(refreshToken);
  sessions.delete(current.refreshToken);
  const user = await findUserById(current.userId);
  if (!user) {
    rejectRefresh();
  }
  return buildIssueResult(current.userId);
}

export function revokeBrowserWebSession(refreshToken: unknown): { revoked: true } {
  if (typeof refreshToken === 'string') {
    const token = refreshToken.trim();
    const session = sessions.get(token);
    if (session) {
      session.revokedAt = new Date();
      sessions.delete(token);
    }
  }
  return { revoked: true };
}

export function clearBrowserWebSessionsForTests(): void {
  sessions.clear();
}
