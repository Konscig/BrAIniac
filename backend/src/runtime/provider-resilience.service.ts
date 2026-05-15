import { HttpError } from '../common/http-error.js';
import { requireRedisClient } from './redis.client.js';
import { redisKey } from './redis.keys.js';

const DEFAULT_PROVIDER_COOLDOWN_MS = 30_000;

function readCooldownMs(): number {
  const parsed = Number(process.env.PROVIDER_COOLDOWN_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PROVIDER_COOLDOWN_MS;
}

function cooldownKey(provider: string, scope: string): string {
  return redisKey('provider', 'cooldown', provider, scope);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_\-./]/g, '_') || 'default';
}

export async function assertProviderAvailable(provider: string, scope: string): Promise<void> {
  const redis = await requireRedisClient('provider resilience store unavailable');
  const key = cooldownKey(normalize(provider), normalize(scope));
  const ttlMs = await redis.pTTL(key);
  if (ttlMs > 0) {
    throw new HttpError(503, {
      ok: false,
      code: 'PROVIDER_COOLDOWN_ACTIVE',
      error: 'provider is cooling down after upstream throttling',
      retryable: true,
      details: {
        provider: normalize(provider),
        scope: normalize(scope),
        retry_after_ms: ttlMs,
      },
    });
  }
}

export async function recordProviderFailure(provider: string, scope: string, status?: number): Promise<void> {
  if (status !== undefined && status !== 429 && status !== 503 && status < 500) {
    return;
  }
  const redis = await requireRedisClient('provider resilience store unavailable');
  await redis.set(
    cooldownKey(normalize(provider), normalize(scope)),
    JSON.stringify({ status: status ?? null, recorded_at: new Date().toISOString() }),
    { PX: readCooldownMs() },
  );
}

export async function recordProviderSuccess(provider: string, scope: string): Promise<void> {
  const redis = await requireRedisClient('provider resilience store unavailable');
  await redis.del(cooldownKey(normalize(provider), normalize(scope)));
}
