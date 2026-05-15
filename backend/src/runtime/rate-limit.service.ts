import crypto from 'node:crypto';
import { HttpError } from '../common/http-error.js';
import { requireRedisClient } from './redis.client.js';
import { redisKey } from './redis.keys.js';

export type RateLimitOptions = {
  bucket: string;
  scope: string | number;
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  bucket: string;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterMs: number;
};

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

function normalizeBucket(bucket: string): string {
  return bucket.trim().toLowerCase().replace(/[^a-z0-9:_\-./]/g, '_') || 'default';
}

function scopeDigest(scope: string | number): string {
  return crypto.createHash('sha256').update(String(scope)).digest('hex');
}

function readPositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function readRateLimitIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return readPositiveNumber(parsed, fallback);
}

export function rateLimitKey(bucket: string, scope: string | number): string {
  return redisKey('rate-limit', normalizeBucket(bucket), scopeDigest(scope));
}

function parseEvalResult(result: unknown): { count: number; ttlMs: number } {
  const values = Array.isArray(result) ? result : [];
  const count = Number(values[0]);
  const ttlMs = Number(values[1]);
  return {
    count: Number.isFinite(count) ? count : 0,
    ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 0,
  };
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitDecision> {
  const bucket = normalizeBucket(options.bucket);
  const limit = readPositiveNumber(options.limit, 1);
  const windowMs = readPositiveNumber(options.windowMs, 1_000);
  const redis = await requireRedisClient('rate limit store unavailable');
  const result = parseEvalResult(
    await redis.eval(RATE_LIMIT_SCRIPT, {
      keys: [rateLimitKey(bucket, options.scope)],
      arguments: [String(windowMs)],
    }),
  );
  const resetMs = result.ttlMs || windowMs;
  const remaining = Math.max(0, limit - result.count);

  return {
    allowed: result.count <= limit,
    bucket,
    limit,
    remaining,
    resetMs,
    retryAfterMs: result.count <= limit ? 0 : resetMs,
  };
}

export async function enforceRateLimit(options: RateLimitOptions): Promise<RateLimitDecision> {
  const decision = await checkRateLimit(options);
  if (decision.allowed) {
    return decision;
  }

  throw new HttpError(429, {
    ok: false,
    code: 'RATE_LIMITED',
    error: 'rate limit exceeded',
    retryable: true,
    details: {
      bucket: decision.bucket,
      limit: decision.limit,
      remaining: decision.remaining,
      reset_ms: decision.resetMs,
      retry_after_ms: decision.retryAfterMs,
    },
  });
}
