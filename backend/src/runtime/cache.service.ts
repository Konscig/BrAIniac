import crypto from 'node:crypto';
import { getRedisClient } from './redis.client.js';
import { redisKey, redisPattern } from './redis.keys.js';

const DEFAULT_CACHE_TTL_MS = 60_000;

function readCacheTtlMs(ttlMs?: number): number {
  const configured = Number(process.env.RUNTIME_CACHE_TTL_MS);
  const value = ttlMs ?? configured;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_CACHE_TTL_MS;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}).sort());
}

export function cacheDigest(value: unknown): string {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

export function runtimeCacheKey(...segments: Array<string | number | boolean | null | undefined>): string {
  return redisKey('cache', ...segments);
}

export async function getRuntimeCache<T>(segments: Array<string | number | boolean | null | undefined>): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;
    const raw = await redis.get(runtimeCacheKey(...segments));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setRuntimeCache(
  segments: Array<string | number | boolean | null | undefined>,
  value: unknown,
  ttlMs?: number,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    await redis.set(runtimeCacheKey(...segments), JSON.stringify(value), { PX: readCacheTtlMs(ttlMs) });
  } catch {
    // Cache is explicitly degraded when Redis is unavailable.
  }
}

export async function getOrSetRuntimeCache<T>(
  segments: Array<string | number | boolean | null | undefined>,
  load: () => Promise<T>,
  ttlMs?: number,
): Promise<T> {
  const cached = await getRuntimeCache<T>(segments);
  if (cached !== null) return cached;
  const loaded = await load();
  await setRuntimeCache(segments, loaded, ttlMs);
  return loaded;
}

export async function invalidateRuntimeCachePattern(...segments: Array<string | number | boolean | null | undefined>): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    const pattern = redisPattern('cache', ...segments);
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 200 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await redis.del(result.keys);
      }
    } while (cursor !== '0');
  } catch {
    // Cache invalidation is best-effort; ownership checks remain authoritative.
  }
}

export function invalidatePipelineExportCache(pipelineId: number): Promise<void> {
  return invalidateRuntimeCachePattern('mcp', 'export', 'pipeline', pipelineId, '*');
}
