import crypto from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import { requireRedisClient } from '../../../runtime/redis.client.js';
import { redisKey, redisPattern } from '../../../runtime/redis.keys.js';
import { readAccessTokenExpiresAt, signAccessToken } from '../../core/jwt.service.js';
import { findUserById } from '../../data/user.service.js';

export const WEB_REFRESH_COOKIE_NAME = process.env.WEB_REFRESH_COOKIE_NAME || 'brainiac_web_refresh';
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type WebRefreshSession = {
  sessionId: string;
  userId: number;
  refreshTokenHash: string;
  refreshExpiresAt: string;
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

function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken).digest('base64url');
}

function refreshSessionKey(refreshToken: string): string {
  return redisKey('auth', 'web-refresh', hashRefreshToken(refreshToken));
}

async function createRefreshSession(userId: number): Promise<{ session: WebRefreshSession; refreshToken: string }> {
  const ttlMs = readPositiveIntEnv('WEB_REFRESH_TTL_MS', DEFAULT_REFRESH_TTL_MS);
  const refreshToken = createToken('bwr');
  const session: WebRefreshSession = {
    sessionId: createToken('bws'),
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    refreshExpiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
  const redis = await requireRedisClient('web refresh session store unavailable');
  await redis.set(refreshSessionKey(refreshToken), JSON.stringify(session), { PX: ttlMs });
  return { session, refreshToken };
}

function rejectRefresh(): never {
  throw new HttpError(401, {
    ok: false,
    code: 'WEB_REFRESH_INVALID',
    message: 'web refresh session expired',
  });
}

function parseSession(raw: string | null): WebRefreshSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const userId = Number(record.userId);
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId : '';
    const refreshTokenHash = typeof record.refreshTokenHash === 'string' ? record.refreshTokenHash : '';
    const refreshExpiresAt = typeof record.refreshExpiresAt === 'string' ? record.refreshExpiresAt : '';
    if (!Number.isInteger(userId) || userId <= 0 || !sessionId || !refreshTokenHash || !refreshExpiresAt) {
      return null;
    }
    return { sessionId, userId, refreshTokenHash, refreshExpiresAt };
  } catch {
    return null;
  }
}

async function consumeActiveRefreshSession(refreshToken: unknown): Promise<WebRefreshSession> {
  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    rejectRefresh();
  }

  const token = refreshToken.trim();
  const redis = await requireRedisClient('web refresh session store unavailable');
  const session = parseSession(await redis.getDel(refreshSessionKey(token)));
  if (!session || session.refreshTokenHash !== hashRefreshToken(token) || Date.parse(session.refreshExpiresAt) <= Date.now()) {
    rejectRefresh();
  }

  return session;
}

async function buildIssueResult(userId: number): Promise<WebRefreshIssueResult> {
  const created = await createRefreshSession(userId);
  const accessToken = signAccessToken({ sub: userId });
  return {
    accessToken,
    expiresAt: readAccessTokenExpiresAt(accessToken),
    refreshToken: created.refreshToken,
    cookie: getWebRefreshCookieConfig(),
  };
}

export async function issueBrowserWebSession(userId: number): Promise<WebRefreshIssueResult> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(401, { error: 'invalid user' });
  }
  return buildIssueResult(userId);
}

export async function refreshBrowserWebSession(refreshToken: unknown): Promise<WebRefreshIssueResult> {
  const current = await consumeActiveRefreshSession(refreshToken);
  const user = await findUserById(current.userId);
  if (!user) {
    rejectRefresh();
  }
  return buildIssueResult(current.userId);
}

export async function revokeBrowserWebSession(refreshToken: unknown): Promise<{ revoked: true }> {
  if (typeof refreshToken === 'string') {
    const token = refreshToken.trim();
    if (token) {
      const redis = await requireRedisClient('web refresh session store unavailable');
      await redis.del(refreshSessionKey(token));
    }
  }
  return { revoked: true };
}

export async function clearBrowserWebSessionsForTests(): Promise<void> {
  const redis = await requireRedisClient('web refresh session store unavailable');
  const pattern = redisPattern('auth', 'web-refresh', '*');
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 200 });
    cursor = result.cursor;
    if (result.keys.length > 0) {
      await redis.del(result.keys);
    }
  } while (cursor !== '0');
}
