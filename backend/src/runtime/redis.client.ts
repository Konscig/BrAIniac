import { createClient } from 'redis';
import { runtimeRedisUnavailable } from './runtime-errors.js';
import { getRedisKeyPrefix } from './redis.keys.js';

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient | null> | null = null;
let lastError: string | null = null;

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getRedisUrl(): string {
  return (process.env.REDIS_URL ?? 'redis://localhost:6379').trim();
}

export function isRedisRequired(): boolean {
  return (process.env.REDIS_REQUIRED ?? 'true').toLowerCase() !== 'false';
}

export function getRedisLastError(): string | null {
  return lastError;
}

export function resetRedisClientForTests(): void {
  const current = client;
  client = null;
  connecting = null;
  lastError = null;
  if (current) {
    void current.quit().catch(() => current.disconnect());
  }
}

async function connectRedis(): Promise<RedisClient | null> {
  if (client?.isOpen) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const created = createClient({
      url: getRedisUrl(),
      socket: {
        connectTimeout: readPositiveIntEnv('REDIS_CONNECT_TIMEOUT_MS', 5000),
        reconnectStrategy: false,
      },
    });

    created.on('error', (error) => {
      lastError = error instanceof Error ? error.message : String(error);
    });

    try {
      await created.connect();
      lastError = null;
      client = created;
      return created;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      try {
        created.destroy();
      } catch {
        // best effort
      }
      client = null;
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export async function getRedisClient(): Promise<RedisClient | null> {
  return connectRedis();
}

export async function requireRedisClient(message?: string): Promise<RedisClient> {
  const redis = await connectRedis();
  if (!redis) {
    runtimeRedisUnavailable(message);
  }
  return redis;
}

export async function pingRedis(): Promise<{ ok: true; latency_ms: number } | { ok: false; error: string | null }> {
  const startedAt = Date.now();
  const redis = await connectRedis();
  if (!redis) {
    return { ok: false, error: lastError };
  }
  try {
    await redis.ping();
    return { ok: true, latency_ms: Date.now() - startedAt };
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return { ok: false, error: lastError };
  }
}

export async function clearRedisPrefixForTests(): Promise<void> {
  const redis = await requireRedisClient('runtime cleanup unavailable');
  const prefix = `${getRedisKeyPrefix()}:`;
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 200 });
    cursor = result.cursor;
    if (result.keys.length > 0) {
      await redis.del(result.keys);
    }
  } while (cursor !== '0');
}
